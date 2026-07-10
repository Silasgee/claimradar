# Canonical Claim Model

> **Status:** Stable specification (Milestone 3). This is the permanent contract for every
> claim the platform will ever produce. It is designed so that adding 100+ protocols
> requires **no breaking changes**: protocol-specific detail lives in `metadata` and
> `provenance`, never in new top-level fields.

The `Claim` type is defined in [`types/index.ts`](../types/index.ts). This document is its
normative specification.

---

## 1. Why a canonical model

The Scan Engine (M1) models a raw on-chain **asset** as `Claimable`. The Discovery Engine
(M3) models a **claim opportunity** as `Claim` — a richer thing that carries lifecycle
state, protocol identity, provenance, gas/value estimation, and ranking. Every discovery
connector emits `Claim`; the API serves `Claim`. Both reuse the shared `Chain`,
`ClaimableCategory`, and `Confidence` enums — no duplicated vocabulary.

---

## 2. Claim lifecycle

A claim is **discovered** on every scan; discovery is stateless and idempotent. Its
`status` is a pure function of on-chain / off-chain truth at discovery time:

```
                    ┌─────────────────────────────────────────────┐
   discover(wallet) │                                             │
        │           ▼                                             │
        │    ┌──────────────┐   eligible & not yet active         │
        └───▶│  (evaluate)  │────────────────────────▶  PENDING    │
             └──────┬───────┘                                     │
                    │ eligible & active & unclaimed               │
                    ├───────────────────────────────▶  CLAIMABLE   │
                    │ eligible but already claimed                │
                    ├───────────────────────────────▶  ALREADY_CLAIMED
                    │ was claimable, window closed                │
                    └───────────────────────────────▶  EXPIRED     │
                                                                   │
             not eligible ────────────────────────▶  (no claim emitted)
```

Status is **recomputed every scan** — there is no stored state machine. A claim that was
`CLAIMABLE` last week and is claimed today is simply discovered as `ALREADY_CLAIMED`, under
the **same stable id** (§9). This is what lets watchlists and history track a claim over
time without a mutable lifecycle table.

---

## 3. Claim states (`ClaimStatus`)

| State             | Meaning                                           | Surfaced? |
| ----------------- | ------------------------------------------------- | --------- |
| `CLAIMABLE`       | Eligible, active, not yet claimed — actionable.   | Yes (top) |
| `PENDING`         | Eligible but not yet active (e.g. vesting cliff). | Yes       |
| `ALREADY_CLAIMED` | Eligible but already claimed by this wallet.      | Yes (low) |
| `EXPIRED`         | Was claimable; the claim window has closed.       | Yes (low) |

Ineligible wallets produce **no claim** — absence is not a state.

---

## 4. Claim categories (`ClaimableCategory`)

Reused from the shared enum: `AIRDROP`, `STAKING_REWARD`, `VESTING`,
`PRESALE_ALLOCATION`, `GOVERNANCE_REWARD`, `NFT_CLAIM`, `REFUND`, `OTHER`. A connector
declares the categories it can produce in `capabilities().categories`.

---

## 5. Confidence levels (`Confidence`)

| Level       | When                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| `CONFIRMED` | Verified against on-chain state (e.g. merkle proof against on-chain root + `isClaimed`). |
| `LIKELY`    | Sourced from an indexer/API that may be stale.                                           |
| `ESTIMATED` | Derived/heuristic.                                                                       |

Rule: an indexer-only number that could be stale must never be `CONFIRMED`.

---

## 6. Ranking fields

Ranking is applied by the Ranking Engine (see [DISCOVERY_ENGINE.md](./DISCOVERY_ENGINE.md#ranking)),
which adds two fields to produce `RankedClaim`:

- `rank` — 1-based position in the ranked result.
- `rankScore` — deterministic composite score (documented weights).

Connectors never set these; the engine owns ranking.

---

## 7. Expiration

`expiresAt` is an ISO-8601 timestamp or `null`. When present and in the past, the connector
should emit `EXPIRED`. The Ranking Engine boosts claims whose `expiresAt` is soon (urgency),
using the **injected clock** so ranking stays deterministic under test.

---

## 8. Provenance

`provenance` is the explainability record (blueprint §1.7). It is **stamped by the engine**,
not trusted from the connector:

| Field              | Source                                        |
| ------------------ | --------------------------------------------- |
| `connectorId`      | Stamped from connector metadata (anti-spoof). |
| `connectorVersion` | Stamped from connector `version`.             |
| `source`           | `onchain` / `indexer` / `api` / `hybrid`.     |
| `chain`            | The chain the claim was read from.            |
| `contractAddress`  | Contract read from / executed against.        |
| `method`           | On-chain method, e.g. `isClaimed(uint256)`.   |
| `blockNumber`      | Block the read was pinned to, or `null`.      |
| `discoveredAt`     | ISO-8601, from the injected clock.            |

---

## 9. Claim ID strategy (stable identity)

Implemented in [`lib/discovery/claim-id.ts`](../lib/discovery/claim-id.ts).

A claim's `id` must be **identical across every rescan** of the same opportunity, so it is
derived **only** from identity dimensions that never change:

```
id = "claim_" + version + "_" + sha256(
        version | chain | protocol | contract | wallet | claimType
     )[:40]
```

- **Deterministic:** no randomness, no timestamps.
- **Excludes mutable state:** amount, status, gas, block, and time are _not_ inputs — as a
  claim accrues or is claimed, its id is unchanged.
- **Case-insensitive:** addresses and ids are lowercased, so checksum variations cannot
  produce two ids for one claim.
- **Versioned:** the `v1` prefix lets the scheme evolve without collisions.

The engine **re-derives** the id during normalization (§10) — a connector cannot choose or
spoof it.

---

## 10. Normalization rules

Implemented in [`lib/discovery/claim-normalizer.ts`](../lib/discovery/claim-normalizer.ts).
Connectors are **untrusted**. Every emitted claim is validated and re-stamped before it
enters the pipeline:

1. **Schema validation (zod).** Structure, enums, and formats (`amountRaw`/`gasLimit` are
   unsigned-integer strings) are validated. **Malformed claims are dropped and logged —
   never repaired.** A wrong claim is worse than a missing one.
2. **Identity re-stamp.** `wallet` is set from the request; `id` is re-derived (§9);
   `provenance.connectorId`/`connectorVersion` are stamped from metadata.
3. **Claim-URL policy (§12).** A claim whose URL fails validation is dropped whole.

Dropped counts are recorded per connector in metrics.

---

## 11. Deduplication rules

Implemented in `dedupeClaims`. Two connectors can discover the same opportunity (same
identity → same id). Dedup keeps the **strongest** occurrence, deterministically:

1. Higher **status** rank (`CLAIMABLE` > `PENDING` > `ALREADY_CLAIMED` > `EXPIRED`).
2. Then higher **confidence** (`CONFIRMED` > `LIKELY` > `ESTIMATED`).
3. Then higher **protocol priority**.
4. Then lexicographically smaller **connectorId** (final deterministic tiebreak).

`duplicatesRemoved` is reported in the discovery report and metrics.

---

## 12. Official claim-URL policy

Implemented in [`lib/discovery/claim-url.ts`](../lib/discovery/claim-url.ts) (blueprint
§17.2 — anti-phishing is a product feature). A claim URL is surfaced **only if**:

1. Its scheme is `http` or `https` (never `javascript:`, `data:`, …).
2. Its host is on the allow-list: the **global** trusted-domain registry (the seam the
   admin plane / FR-14 will manage) **∪** the connector's declared `trustedDomains`.
   Matching is exact host or subdomain; suffix lookalikes
   (`claims.example.org.evil.io`) are rejected.

A connector cannot emit an arbitrary executable URL — the engine drops any claim that
fails this policy.

---

## 13. Gas estimation

`gasEstimate` is `{ gasLimit }` (uint256-safe string) or `null`. It is **best-effort**: a
connector attempts it (e.g. `estimateContractGas` for the claim call) only when it makes
sense (status `CLAIMABLE`) and returns `null` on any failure. Gas estimation must **never**
fail discovery. ClaimRadar is read-only — it estimates but never executes the claim.

---

## 14. Value estimation

`usdValue` is `number | null`. It is `null` until the price-enrichment milestone; connectors
do **not** price their own claims (pricing is centralized so it isn't reinvented per
protocol). Ranking treats `null` as a zero value contribution.

---

## 15. Metadata

`metadata` is an open `Record<string, unknown>` for protocol-specific, **non-authoritative**
detail (e.g. merkle `index`, `merkleRoot`). It is preserved for explainability and future
replay, and is **never** used for ranking, dedup, or identity. This field is the pressure
valve that keeps the model stable across 100+ protocols.
