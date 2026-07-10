# Discovery Connector SDK

> **Status:** Stable contract (Milestone 3). This is the permanent agreement between the
> platform and every discovery-connector author. If your connector honors this document, the
> Discovery Engine gives it isolation, observability, caching, and security for free.

The SDK interface is [`lib/discovery/connector.ts`](../lib/discovery/connector.ts). The
reference implementation is
[`connectors/discovery/merkle-distributor/`](../connectors/discovery/merkle-distributor).

---

## 1. Architecture & the one rule

A discovery connector encodes the **business rules of one protocol**: given a wallet, what
can it claim? It sits between the Chain Access Layer and the Discovery Engine (see
[DISCOVERY_ENGINE.md §1](./DISCOVERY_ENGINE.md#1-layering--separation-of-concerns)).

**The one rule: everything comes through the injected `DiscoveryContext`.** A connector
never imports a client, reads `process.env`, calls `new Date()`, or logs to the console. It
receives capabilities and returns canonical `Claim`s. This is what makes connectors
isolated, deterministic, testable, and impossible to run outside the platform's rate limits
and observability.

```
interface DiscoveryContext {
  logger  // structured, pre-scoped to your connector id
  cache   // namespaced to your connector id + version
  config  // your config (injected; never process.env)
  now     // injected clock — use instead of new Date()
  chain   // (chain) => read-only viem client (the ONLY chain access)
  signal? // cooperative cancellation
}
```

---

## 2. The interface

Exactly these members (no more, no less):

| Member               | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `metadata`           | `{ id, displayName, protocol: { id, name } }`. `id` is a unique slug. |
| `version`            | Semver. Bumping it invalidates your cache namespace.                  |
| `priority`           | Ranking/tiebreak weight (higher = stronger protocol).                 |
| `supportedChains()`  | Chains you can discover on. Used for selection.                       |
| `capabilities()`     | `accessMode`, `categories`, `gasEstimation`, `trustedDomains`.        |
| `discover(ctx, req)` | The work. Returns `{ claims: Claim[] }`.                              |
| `health(ctx)`        | Probe upstream reachability without a full discovery.                 |

---

## 3. Lifecycle

```
register (createDefaultDiscoveryRegistry)
   → select      supportedChains() ∩ requested chains
   → context     engine builds a DiscoveryContext (logger/cache/config/now/chain)
   → runIsolated engine runs discover() under timeout + retries + cancellation
   → normalize   engine validates, re-stamps id/provenance, enforces URL policy
   → merge/rank  engine dedupes + ranks; your claims join the report
```

Your `discover()` must be **read-only, idempotent, and deterministic** given the injected
clock. Return `{ claims: [] }` when there is nothing to claim — that is the common case, not
an error. Throw a `ConnectorError` subclass only on genuine upstream failure.

---

## 4. Performance expectations

- **Budget round-trips, not calls.** Aim for 1–3 RPC round-trips. Batch bounded read-sets
  into **one** `multicall` (`allowFailure: true`); never issue N sequential `eth_call`s.
- **Skip empties early.** Ineligible wallets should return before touching the chain.
- **Exact math only.** Amounts are bigints/strings end-to-end; format with viem's
  `formatUnits`. Never `Number()` a base-unit amount.
- **Cache slow-moving reads** via `ctx.cache` (merkle roots, schedules). The namespace is
  already version-keyed.
- **Be cooperative.** Call `ctx.signal?.throwIfAborted()` between phases so cancellations
  stop work promptly.

A healthy connector finishes well under 1s; the hard per-attempt deadline is 8s.

---

## 5. Timeout rules

Every attempt runs under a hard timeout (default **8s**), enforced by the runtime by racing
your work against a combined (caller + timeout) signal. A connector that ignores
`ctx.signal` is still cut off at the deadline — but a cooperative connector that observes the
signal stops sooner and frees resources. Do not implement your own timeouts.

---

## 6. Retry behavior

The runtime retries transient failures with exponential backoff + jitter (default **2**
retries). Classification:

- Throw **`ConnectorConfigurationError`** for permanent problems (missing config, bad
  metadata) — it is **never retried**.
- Throw any other `ConnectorError` (or let an error propagate) for transient problems — it
  **is retried**. Timeouts are transient.

Because retries re-run `discover()`, it **must be idempotent** (it is, if read-only).

---

## 7. Logging requirements

Use `ctx.logger` only. It is structured (pino) and pre-scoped with your connector id and the
discovery id. Log objects first, message second: `ctx.logger.warn({ wallet }, "…")`. Never
`console.log`. Never log secrets. Skips and soft failures (e.g. a proof that didn't verify,
gas estimation unavailable) should be `warn`/`debug` with context.

---

## 8. Metrics requirements

You do not record metrics — the engine does, from your run outcome and output (duration,
success/failure, claims found, drops, category/protocol breakdowns). Your only obligation is
to **return honestly and fail loudly**: return the claims you found, and throw on real
failure so the run is counted as failed rather than silently empty.

---

## 9. Security requirements (treat every connector as untrusted)

- **Claim URLs** must be `http(s)` and on a domain you declare in
  `capabilities().trustedDomains` (∪ the global allow-list). The engine drops any claim
  whose URL fails this — declare your domains, or your claims vanish.
- **Never repair invalid data.** If you can't produce a valid claim, don't produce one.
- **You cannot spoof identity.** The engine re-derives the claim `id` and stamps
  `provenance.connectorId/version` and `wallet` regardless of what you set — but set them
  correctly anyway for clarity.
- **Read-only.** Never execute a transaction. Gas estimation is the only "write-shaped" call
  allowed, and only as a best-effort estimate.

---

## 10. Testing requirements

- **Never hit a public RPC.** Mock at the **viem transport level** (`custom()` transport) so
  tests exercise the real client and real ABI encode/decode with zero network. See
  [`tests/merkle-rpc.ts`](../tests/merkle-rpc.ts) for the pattern.
- Cover: eligible/ineligible, already-claimed, expired, on-chain read failure, and (if
  applicable) proof/verification failure.
- Test through the `DiscoveryEngine` at least once to prove normalization, ranking, and
  isolation behave for your connector.
- Keep fixtures deterministic; use the injected clock.

---

## 11. Example connector skeleton

```ts
import type {
  ConnectorCapabilities,
  DiscoveryConnector,
  DiscoveryConnectorMetadata,
  DiscoveryContext,
  HealthStatus,
} from "@/lib/discovery";
import { computeClaimId } from "@/lib/discovery";
import { Chain, ClaimableCategory, ClaimStatus, Confidence } from "@/types";
import type { DiscoveryRequest, DiscoveryResult } from "@/types";

export class MyProtocolConnector implements DiscoveryConnector {
  readonly metadata: DiscoveryConnectorMetadata = {
    id: "my-protocol",
    displayName: "My Protocol Rewards",
    protocol: { id: "my-protocol", name: "My Protocol" },
  };
  readonly version = "1.0.0";
  readonly priority = 50;

  supportedChains(): Chain[] {
    return [Chain.ETHEREUM];
  }

  capabilities(): ConnectorCapabilities {
    return {
      accessMode: "onchain",
      categories: [ClaimableCategory.STAKING_REWARD],
      gasEstimation: false,
      trustedDomains: ["app.myprotocol.xyz"],
    };
  }

  async health(ctx: DiscoveryContext): Promise<HealthStatus> {
    try {
      await ctx.chain(Chain.ETHEREUM).getBlockNumber();
      return { healthy: true };
    } catch (e) {
      return { healthy: false, detail: e instanceof Error ? e.message : "unreachable" };
    }
  }

  async discover(ctx: DiscoveryContext, req: DiscoveryRequest): Promise<DiscoveryResult> {
    const wallet = req.wallet.toLowerCase() as `0x${string}`;
    ctx.signal?.throwIfAborted();

    // 1) read on-chain state via ctx.chain() (batch into one multicall)
    // 2) interpret business rules → amount, status
    // 3) return [] when nothing is claimable
    const amountRaw = 0n;
    if (amountRaw === 0n) return { claims: [] };

    const contract = "0x…"; // your reward contract
    return {
      claims: [
        {
          id: computeClaimId({
            chain: Chain.ETHEREUM,
            protocol: this.metadata.protocol.id,
            contract,
            wallet,
            claimType: "staking-reward",
          }),
          wallet,
          chain: Chain.ETHEREUM,
          protocol: { ...this.metadata.protocol, priority: this.priority },
          category: ClaimableCategory.STAKING_REWARD,
          claimType: "staking-reward",
          status: ClaimStatus.CLAIMABLE,
          token: { symbol: "MYP", name: "My Token", decimals: 18, contractAddress: null },
          amountRaw: amountRaw.toString(),
          amountDecimal: "0",
          usdValue: null,
          gasEstimate: null,
          confidence: Confidence.CONFIRMED,
          riskFlags: [],
          claimUrl: "https://app.myprotocol.xyz/claim",
          expiresAt: null,
          provenance: {
            connectorId: this.metadata.id,
            connectorVersion: this.version,
            source: "onchain",
            chain: Chain.ETHEREUM,
            contractAddress: contract,
            method: "earned(address)",
            blockNumber: null,
            discoveredAt: ctx.now().toISOString(),
          },
          metadata: {},
        },
      ],
    };
  }
}
```

---

## 12. Registration

Register production connectors in
[`connectors/discovery/index.ts`](../connectors/discovery/index.ts):

```ts
export function createDefaultDiscoveryRegistry(): DiscoveryConnectorRegistry {
  const registry = new DiscoveryConnectorRegistry();
  registry.register(new MerkleDistributorConnector());
  registry.register(new MyProtocolConnector()); // ← add here
  return registry;
}
```

Registering a duplicate id throws `ConnectorConfigurationError` — ids are unique.

---

## 13. Versioning strategy

- Connectors are **semver'd** via `version`.
- The version is part of the connector's **cache namespace** (`discovery:<id>:<version>`), so
  bumping it after a bugfix **auto-invalidates stale cached results** — no manual cache
  clearing.
- Bump **patch** for fixes, **minor** for additive behavior, **major** when output semantics
  change (e.g. category or claim-type changes that affect the stable id).
- The claim-id scheme itself is versioned separately (`CLAIM_ID_VERSION`); changing it is a
  platform-wide migration, not a per-connector bump.
