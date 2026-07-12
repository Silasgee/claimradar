# EigenLayer Rewards Connector

Discovers a wallet's **claimable EigenLayer restaking / AVS rewards** from the
official `RewardsCoordinator`. It is the first live-value connector of Phase 2.

- **Connector id:** `eigenlayer-rewards`
- **Protocol:** EigenLayer (`eigenlayer`)
- **Chain:** Ethereum mainnet
- **Category:** `STAKING_REWARD`
- **Access mode:** `hybrid` (off-chain proof, on-chain verification)
- **Confidence:** `CONFIRMED` — every surfaced claim is verified on-chain

## How eligibility is determined

EigenLayer distributes rewards as a periodically-posted cumulative Merkle root
(`DistributionRoot`) in the `RewardsCoordinator`. An earner's cumulative
earnings per token live in the off-chain distribution; the contract stores only
the root and each earner's `cumulativeClaimed`. Claimable per token is:

```
claimable = cumulativeEarnings (from the proof) − cumulativeClaimed (on-chain)
```

Verified against Layr-Labs/eigenlayer-contracts:

- Leaf encoding: `keccak256(abi.encodePacked(SALT, earner, earnerTokenRoot))` and
  `keccak256(abi.encodePacked(SALT, token, cumulativeEarnings))`.
- Proof verification: `Merkle.verifyInclusionKeccak` (index-ordered).
- `checkClaim(RewardsMerkleClaim) view` verifies a full claim against the
  current root — this is our on-chain ground truth.

## Data flow

```
proof provider (sidecar)  →  RewardsMerkleClaim
        │                          │
        │        ┌── on-chain: checkClaim(claim) MUST pass ──┐   (never trust the provider)
        ▼        ▼                                           │
   discover() ── read cumulativeClaimed[earner][token] ──────┘
        │
        └── read token symbol/decimals (cached) ── build canonical Claim(s)
```

**Security invariant:** the proof provider is untrusted. A claim is only
surfaced if the on-chain `checkClaim` accepts it, so a compromised or buggy
provider can only ever cause _fewer_ claims — never a fabricated one. The
connector is read-only and never executes `processClaim`.

## The proof provider seam (Option B)

Proofs come from EigenLayer's official **sidecar** via the
`EigenLayerProofProvider` interface (`proof-provider.ts`). The interface keeps
the connector agnostic to _how_ proofs are produced, so a locally-generated
proof engine can replace the sidecar later without touching connector logic.

`SidecarProofProvider` reads from the injected sidecar base URL. The exact
request path / response schema are written to the sidecar's documented rewards
API and **confirmed at deploy** against the live sidecar — a mismatch is safe
because of the on-chain verification invariant above.

## Configuration (injected — nothing hardcoded)

All values are injected through `ctx.config` (sourced from validated env in
`createDiscoveryEngine`). Every var is **optional**; if any is unset the
connector is **inert** (discovers nothing) rather than failing the scan.

| env var                          | `ctx.config` key     | purpose                                   |
| -------------------------------- | -------------------- | ----------------------------------------- |
| `EIGENLAYER_REWARDS_COORDINATOR` | `rewardsCoordinator` | RewardsCoordinator proxy (mainnet)        |
| `EIGENLAYER_SIDECAR_URL`         | `sidecarUrl`         | official sidecar / proof-service base URL |
| `EIGENLAYER_CLAIM_URL`           | `claimUrl`           | official claim page shown to users        |

Mainnet RewardsCoordinator: `0x7750d328b314EfFa365A0402CcfD489B80B0adda`
(verified against the Layr-Labs repo). The claim domain `eigenlayer.xyz` is a
**static** entry in the connector's `trustedDomains` allow-list — deliberately
not config-driven, so configuration can never widen the URL allow-list.

## Failure handling

- **No rewards** (provider returns null) → empty result (not an error).
- **Invalid/stale proof** (`checkClaim` rejects) → dropped, nothing surfaced.
- **Earner ≠ scanned wallet** → dropped (never surface another address's claim).
- **RPC unreachable** → retryable `ConnectorExecutionError` (reported as a failed
  run, isolated by the runtime — never breaks other connectors).
- **Provider transport/parse failure** → retryable `ConnectorExecutionError`.
- **Non-standard token metadata** → safe fallback symbol; amount/address stay accurate.

## Limitations

- **USD value** is `null` until price feeds (Phase 2.2).
- **Gas estimation** is off for v1 (`gasEstimation: false`).
- The sidecar request path / response schema and a live eligible-wallet check
  are confirmed at deploy (the build sandbox has no external network; unit tests
  use mocked transport + a stubbed provider).
- Covers `RewardsCoordinator` rewards only; the EIGEN stakedrop season claim is a
  possible later EigenLayer follow-up.

## Tests

`tests/eigenlayer-connector.test.ts` (mocked RPC + stubbed provider): eligible
earner, partial claim, fully-claimed, multi-token, on-chain rejection (revert &
false), earner mismatch, no-rewards, provider failure, RPC failure, malformed
address, unconfigured inertness, deterministic id, token-metadata fallback,
health. Mocking mirrors the house pattern in `tests/eigenlayer-rpc.ts`.
