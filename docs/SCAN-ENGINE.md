# Scan Engine — Milestone 1

The Claim Scan Engine is the execution pipeline every protocol connector runs through.
It lives in `lib/scan/` and follows the blueprint's fan-out design
([ARCHITECTURE.md](ARCHITECTURE.md) §4.3, §9.5, §15): **partial success is success**,
**a failing connector never fails a scan**, and **the core knows nothing protocol-specific**.

## Components

| Component          | File                            | Responsibility                                                         |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| `ScanService`      | `lib/scan/scan-service.ts`      | Pipeline orchestration: select → execute → normalize → merge → report  |
| `ConnectorRuntime` | `lib/scan/connector-runtime.ts` | Isolated execution of ONE connector: timeout, retries, cancellation    |
| Normalization      | `lib/scan/normalize.ts`         | Runtime validation into the shared `Claimable` model; merge + ordering |
| `ScanMetrics`      | `lib/scan/metrics.ts`           | In-process counters/durations; snapshot for `/api/internal/metrics`    |
| Concurrency        | `lib/scan/concurrency.ts`       | Bounded-parallelism fan-out primitive                                  |

`createScanService()` (in `lib/scan/index.ts`) wires production defaults: the default
connector registry, the shared metrics registry, and the Redis-backed connector cache.

## Scan lifecycle

```
ScanRequest { address, chains? }
   │
   ▼
1. VALIDATE      address present (ValidationError otherwise); trimmed
   │
   ▼
2. SELECT        registry.forRequest(request)
   │             • connector.supports() is a cheap pre-filter
   │             • a supports() that THROWS excludes that connector only
   ▼
3. EXECUTE       mapWithConcurrency(connectors, concurrency = 5)
   │             each connector → ConnectorRuntime.execute(...)
   │             whole-scan deadline (30s) + caller AbortSignal
   ▼
4. NORMALIZE     every successful response validated item-by-item (zod)
   │             malformed claimables DROPPED + logged + counted, never "fixed"
   │             connectorId stamped from metadata (provenance can't be spoofed)
   ▼
5. MERGE         sort deterministically, dedupe by claimable id
   │             (highest-ranked duplicate wins)
   ▼
6. REPORT        ScanReport { status, claimables, connectorRuns[], durations }
```

### Scan status semantics

| Status     | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `COMPLETE` | Every applicable connector succeeded (vacuously true for zero) |
| `PARTIAL`  | At least one connector succeeded, at least one did not         |
| `FAILED`   | Connectors ran; none succeeded                                 |

`ScanService.scan()` resolves with a report in all three cases. It only rejects on a
malformed request (`ValidationError`) or an engine bug.

## Connector lifecycle (within one scan)

```
register (createDefaultRegistry)
   → select   supports(request) — pure, cheap, exceptions excluded
   → context  ConnectorContext built per run:
                logger   child logger (scanId, connectorId)
                cache    namespaced `connector:<id>:<version>` — version bump
                         invalidates that connector's cache (blueprint §13)
                config   per-connector config map (never process.env)
                now      injected clock
                signal   injected per attempt by the runtime
   → execute  1..N attempts under the runtime (below)
   → normalize / summarize → ConnectorRunSummary in the report
```

## Runtime architecture

`ConnectorRuntime.execute()` **never throws** — every outcome is a value:

| `ConnectorRunStatus` | When                                                       |
| -------------------- | ---------------------------------------------------------- |
| `SUCCESS`            | An attempt resolved                                        |
| `FAILED`             | Attempts exhausted (or permanent error) — `error` attached |
| `TIMEOUT`            | Final attempt exceeded the per-attempt deadline            |
| `CANCELLED`          | Caller's signal (or the scan deadline) aborted the run     |

### Timeout enforcement

Each attempt races the connector against a combined AbortSignal
(`AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)])`):

- **Cooperative** connectors observe `ctx.signal` and stop work early.
- **Non-cooperative** connectors lose the race anyway — the scan proceeds at the
  deadline; the connector's eventual settlement is marked handled so it cannot become
  an unhandled rejection.

### Failure handling

- Anything a connector throws is converted to a `ConnectorError`
  (`ConnectorExecutionError` for raw errors, cause preserved for logs).
- The error surface in `ScanReport` is client-safe: `{ code, message }` only.
- Errors are logged with connector id, attempt count, and code at `warn`.

### Retry policy

| Parameter       | Default | Meaning                                       |
| --------------- | ------- | --------------------------------------------- |
| `timeoutMs`     | 8000    | Hard per-attempt deadline (blueprint §9.5)    |
| `maxRetries`    | 2       | Additional attempts after the first           |
| `backoffBaseMs` | 250     | Attempt n waits ~ base × 2^(n−1), ±20% jitter |
| `maxBackoffMs`  | 5000    | Cap on a single backoff delay                 |

Classification: **`ConnectorConfigurationError` is permanent — never retried.**
Everything else (including timeouts) is assumed transient and retried until
`maxRetries` is exhausted. Reads are idempotent by SDK contract, so retries are safe.
Cancellation is honored before an attempt, during an attempt, and during backoff;
a cancelled backoff never starts another attempt.

## Concurrency model

- Fan-out runs through `mapWithConcurrency` (default **5** connectors in flight),
  the bulkhead against unbounded parallelism as the registry grows.
- A **whole-scan deadline** (default **30s**) is combined with the caller's
  AbortSignal; when it fires, in-flight runs report `CANCELLED` and the scan returns
  whatever succeeded (`PARTIAL`).
- Everything is in-process for this milestone. The queue/worker tier from the
  blueprint (§11) replaces `mapWithConcurrency` scheduling when scans become async
  jobs — the runtime and service contracts are designed to survive that move.

## Metrics

`ScanMetrics` records, per process:

- scans: total, by status, duration (count/total/min/max/avg), claimables found
- per connector: runs, by status, success rate, retries, dropped claimables, duration

Snapshot exposed at **`/api/internal/metrics`** — always served outside production;
in production only with `INTERNAL_METRICS_ENABLED=true`, and deployments must
network-restrict `/api/internal/*` regardless (blueprint §16: internal metrics are
network-restricted, not authenticated).

## Deferred by design (blueprint alignment)

- **Circuit breaker / health-based skip** (§9.5) — arrives with M2 hardening;
  the runtime's status taxonomy already carries the signals it needs.
- **Queue/worker execution + streamed partials** (§4.3, §11) — the in-process
  pipeline is the synchronous core those will wrap.
- **Persistence of scans/claimables** — the Prisma models exist; writing reports is
  a later milestone.
- **Claim-URL domain allow-list** (§17.2) — normalization already rejects non-http(s)
  schemes; the allow-list layers on top.
