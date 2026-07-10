# Chain Access — how connectors query chains

Milestone 2 introduced the Chain Access Layer (`lib/chain/`) and the first production
connector (`connectors/ethereum/`). This document is the guide for everyone writing a
connector that touches a chain. Blueprint references: §4.2 #6, §9.2, §9.6, ADR-1.

## The one rule

**Connectors never construct chain clients.** All chain access flows through the
injected context:

```
ctx.chain(Chain.ETHEREUM)  →  read-only viem PublicClient
```

The client comes from the Chain Access Layer (`ChainAccess` / `ViemChainAccess`), which
owns provider URLs (env-configured), transport timeouts, client caching — and, in later
milestones, failover, rate limiting, and per-provider quota protection. Because every
connector goes through this seam, those cross-cutting controls apply to all of them at
once; a connector that built its own client would silently bypass them. Requesting an
unconfigured chain throws `ChainNotConfiguredError`, which the runtime records as a
failed run without harming the scan.

In tests, the same seam is where mocking happens: inject a `ChainAccess` stub (or
`ctx.chain` directly) serving a viem client with a `custom()` transport whose JSON-RPC
responses are fixtures. Tests then exercise the real client and real ABI
encoding/decoding with zero network — see `tests/ethereum-rpc.ts`. **Never hit public
RPCs from tests.**

## On-chain reads vs indexers (ADR-1 refresher)

| Question shape                                                  | Use                          |
| --------------------------------------------------------------- | ---------------------------- |
| Bounded, known set of contracts with per-address view functions | Direct on-chain reads (here) |
| "Which of an unknown/historical set applies to this address?"   | Indexer (future capability)  |

The Ethereum connector's curated token list is the canonical example: a fixed set of
`balanceOf` reads is one multicall; discovering _every_ token an address ever touched
is an indexer problem and must not be attempted with RPC scans.

## Batching strategy

- **One multicall per bounded read-set.** N contract reads must become ONE
  `client.multicall({ contracts, allowFailure: true })` round-trip (multicall3), not N
  `eth_call`s. The Ethereum connector reads 8 token balances + native balance in **two**
  RPC requests total — asserted in its tests.
- **`allowFailure: true` always.** One unreadable contract must degrade that item only,
  never the whole batch. Log the skip at `warn`.
- **Issue independent requests together** (`Promise.all`), not sequentially.
- **Pin static metadata as constants.** Token symbol/name/decimals for a curated list
  are effectively immutable; pinning them avoids 3 extra calls per token per scan.

## Performance guidelines

1. **Budget round-trips, not calls.** A connector should complete in 1–3 RPC
   round-trips. The runtime's per-attempt deadline is 8s; a healthy connector should
   finish in well under 1s.
2. **Skip empties early.** Zero balances / unset claims produce no `Claimable`; don't
   enrich what you're about to drop.
3. **Use `ctx.cache` for slow-moving reads** (e.g. merkle roots, vesting schedules).
   The namespace is already versioned per connector — bumping the connector version
   invalidates its cache.
4. **Exact math only.** Amounts are bigints end-to-end; format with viem's
   `formatUnits` (string math) — never `Number()` on base-unit amounts.
5. **Be cooperative.** Check `ctx.signal?.throwIfAborted()` between RPC phases so
   cancellations stop work promptly. The runtime enforces the hard deadline regardless.

## RPC provider abstraction

```
Connector ──ctx.chain(chain)──► ChainAccess (interface)
                                   │
                                   ├─ ViemChainAccess (production)
                                   │    env-configured URL per chain (ETHEREUM_RPC_URL)
                                   │    http transport: timeout 5s, retryCount 0
                                   │    one cached PublicClient per chain
                                   │
                                   └─ test stubs (custom transport, fixtures)
```

Decisions worth knowing:

- **Transport `retryCount: 0` is deliberate.** Retries are owned by the
  `ConnectorRuntime` (backoff + jitter, cancellation-aware, metered). Transport-level
  retries would multiply attempts (3 × 3 = 9 calls against a struggling provider) and
  hide failures from the runtime's metrics and (future) circuit breaker.
- **Transport timeout (5s) < runtime attempt deadline (8s)** so a dead provider
  surfaces as a retryable error inside the attempt instead of burning the whole budget.
- **Failover/multi-provider is a ChainAccess concern** (blueprint §14.2): when it
  lands, connectors change nothing — the seam absorbs it.
- The default `ETHEREUM_RPC_URL` is a public endpoint for development only; production
  deployments must configure a dedicated provider key.

## Normalization stance for asset reads

Balance-style discoveries map to `Claimable` with category `OTHER` and confidence
`CONFIRMED` (a direct on-chain read is ground truth), `usdValue: null` until the price
enrichment milestone, and an Etherscan URL as the user-facing link. Zero balances are
omitted. Claim-mechanism connectors (airdrops, vesting, rewards) use their specific
categories and real claim URLs, subject to the allow-list when it lands (§17.2).
