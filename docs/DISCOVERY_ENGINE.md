# Discovery Engine — Milestone 3

The Discovery Engine is the heart of ClaimRadar: it turns a wallet address into a ranked
list of **claim opportunities**. It lives in [`lib/discovery/`](../lib/discovery) and sits
**above** the Scan Engine (M1) and the Chain Access Layer (M2).

---

## 1. Layering & separation of concerns

The milestone mandates a strict, one-directional layering. Each layer knows only the layer
directly below it:

```
   Chain Access Layer        lib/chain — provider-abstracted read-only clients.
   (the "chain" tier)        NO business logic. Gathers blockchain data.
            │  ctx.chain()
            ▼
   Discovery Connectors      connectors/discovery/* — protocol BUSINESS RULES.
                             Interpret data into canonical Claims. Never know how
                             RPC providers work (only ctx.chain()).
            │  discover()
            ▼
   Discovery Engine          lib/discovery/discovery-engine — orchestration only.
                             Knows nothing about blockchains; speaks only Claims.
            │
            ▼
   Ranking Engine            lib/discovery/ranking — deterministic ordering.
            │
            ▼
   Normalized Claims  →  DiscoveryReport  →  (API response, future milestone)
```

**Why this holds in code:**

- **Chain connectors contain no business logic** — the Chain Access Layer only returns
  read-only clients. Interpretation lives entirely in discovery connectors.
- **Discovery connectors never know how RPC providers work** — they receive an abstract
  `ctx.chain(chain)` client; provider URLs, timeouts, and failover are hidden in
  `lib/chain`. They cannot construct a client.
- **The Discovery Engine knows no blockchain details** — it only ever handles the canonical
  `Claim` model. Swap every connector's internals and the engine is unchanged.

### Relationship to the Scan Engine

The Discovery Engine **reuses** the Scan Engine's `ConnectorRuntime` as its isolated
execution primitive (timeout / retry / cancellation / error-isolation) via the generic
`runIsolated<T>()`. This is the "Discovery Engine sits above the Scan Engine" relationship
made concrete: the discovery layer builds on the scan layer's runtime rather than
duplicating it. The two engines keep **separate** connector types, registries, models, and
metrics.

---

## 2. Discovery pipeline

```
DiscoveryRequest { wallet, chains? }
   │
   ▼
1. VALIDATE     wallet present and a 0x 20-byte address (ValidationError otherwise)
   │
   ▼
2. SELECT       registry.forRequest() — connectors whose supportedChains() overlaps
   │            the request. A supportedChains() that THROWS excludes that connector only.
   ▼
3. EXECUTE      mapWithConcurrency(connectors, concurrency=5)
   │            each → ConnectorRuntime.runIsolated(discover(...))
   │            whole-discovery deadline (30s) + caller AbortSignal
   ▼
4. NORMALIZE    validate each claim (zod) · drop+log malformed · re-derive stable id ·
   │            stamp wallet + provenance · enforce claim-URL allow-list
   ▼
5. MERGE+DEDUPE dedupe by stable id, keeping the strongest occurrence
   │
   ▼
6. RANK         deterministic composite score → RankedClaim[]
   │
   ▼
7. REPORT       DiscoveryReport { status, claims[], connectorRuns[], stats, durations }
```

Status aggregation reuses the Scan Engine's semantics: `COMPLETE` (all connectors
succeeded), `PARTIAL` (some succeeded), `FAILED` (none succeeded). `discover()` resolves
with a report in all three cases; it rejects only on a malformed request.

---

## 3. Failure handling

- **A failing connector never fails discovery.** `runIsolated()` never throws — every
  outcome (success / failure / timeout / cancellation) is a value. One broken protocol
  degrades to a `PARTIAL` report listing which connector failed.
- **Untrusted output.** Even on success, a connector's claims are validated and re-stamped
  (see [CLAIM_MODEL.md §10](./CLAIM_MODEL.md#10-normalization-rules)); malformed claims are
  dropped, never repaired.
- **Errors are client-safe.** Connector errors surface in the report as `{ code, message }`
  only — no stacks, no causes.

---

## 4. Retry policy

Inherited from the shared runtime (see [SCAN-ENGINE.md](./SCAN-ENGINE.md#retry-policy)):
per-attempt hard timeout (default 8s), up to `maxRetries` (default 2) with exponential
backoff + ±20% jitter. `ConnectorConfigurationError` is permanent and never retried;
everything else (including timeouts) is treated as transient. Discovery reads are
idempotent, so retries are safe.

---

## 5. Concurrency model

- Fan-out through `mapWithConcurrency` (default **5** connectors in flight) — the bulkhead
  against unbounded parallelism as the connector set grows.
- A **whole-discovery deadline** (default **30s**) combined with the caller's AbortSignal;
  when it fires, in-flight runs report `CANCELLED` and the report returns whatever
  succeeded.
- In-process for this milestone. The blueprint's queue/worker tier (§11) will wrap this
  synchronous core when discovery becomes an async job — the engine and runtime contracts
  are designed to survive that move.

---

## 6. Ranking

Implemented in [`lib/discovery/ranking.ts`](../lib/discovery/ranking.ts). Deterministic is a
hard requirement: the same claims + the same clock always yield the same order. Ranking is a
**transparent additive score** (no opaque weights), summing the mandated factors:

| Factor              | Contribution                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| Claim status        | `CLAIMABLE` +1000, `PENDING` +200, `ALREADY_CLAIMED` −500, `EXPIRED` −1000 |
| Confidence          | `CONFIRMED` +300, `LIKELY` +150, `ESTIMATED` +50                           |
| Estimated USD value | `+ min(usdValue, 1e6) × 0.01` (null → 0 until pricing lands)               |
| Expiration urgency  | `+ (100 − daysLeft)` for live claims expiring within 100 days              |
| Protocol priority   | `+ min(priority, 100)`                                                     |
| Gas cost            | `− min(gasLimit / 10 000, 50)`                                             |
| Risk level          | `− 25 × riskFlags.length`                                                  |

Claims sort by score descending; ties break by stable claim id (ascending) — a **total
order**, so ordering is independent of connector completion order. `rank` (1-based) and a
rounded `rankScore` are assigned. Expiration urgency uses the injected clock for
determinism.

---

## 7. Metrics

`DiscoveryMetrics` ([`lib/discovery/metrics.ts`](../lib/discovery/metrics.ts)) records, per
process, everything Phase 7 requires:

- **discovery duration** and **ranking duration** (count/total/min/max/avg)
- **connector duration**, **connector failures**, **success rate**
- **successful discoveries**, **claims found**, **duplicates removed**, **dropped claims**
- **claims by category** and **claims by protocol**

Exposed at **`/api/internal/metrics`** under the `discovery` key, alongside the Scan
Engine's metrics under `scan` — same access policy (404 in production unless
`INTERNAL_METRICS_ENABLED=true`; network-restricted regardless).

---

## 8. Deferred by design

- **Persistence & caching of reports** — the Prisma models exist; connector-level caching is
  wired (`ctx.cache`) but report persistence is a later milestone.
- **Queue/worker execution + streamed partials** (blueprint §4.3, §11).
- **Price enrichment** — `usdValue` stays `null`; ranking already accounts for it.
- **Circuit breaker / health-based skip** (blueprint §9.5) — `health()` exists on the SDK;
  the engine will consult it when the breaker lands.
- **Global claim-URL allow-list population** — the mechanism ships; the admin-managed
  registry (FR-14) fills it.
