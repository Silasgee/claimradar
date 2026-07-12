import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";

import { ConnectorExecutionError } from "@/connectors";
import { computeClaimId } from "@/lib/discovery/claim-id";
import type {
  ConnectorCapabilities,
  DiscoveryConnector,
  DiscoveryConnectorMetadata,
  DiscoveryContext,
  HealthStatus,
} from "@/lib/discovery/connector";
import {
  Chain,
  ClaimableCategory,
  ClaimStatus,
  Confidence,
  type Claim,
  type DiscoveryRequest,
  type DiscoveryResult,
} from "@/types";

import { REWARDS_COORDINATOR_ABI } from "./abi";
import {
  ProofProviderError,
  SidecarProofProvider,
  type EigenLayerProofProvider,
} from "./proof-provider";
import type { RewardsMerkleClaim, TokenTreeMerkleLeaf } from "./types";

/**
 * EigenLayer rewards discovery connector (Phase 2, connector #1).
 *
 * Surfaces a wallet's CLAIMABLE restaking/AVS rewards from EigenLayer's
 * RewardsCoordinator. Flow:
 *   1. fetch the earner's proof from the injected proof provider (sidecar),
 *   2. VERIFY it on-chain via `checkClaim` — the contract is ground truth, so a
 *      compromised provider can never yield a false claim (never trust the
 *      sidecar),
 *   3. read `cumulativeClaimed` per token; claimable = cumulativeEarnings − claimed,
 *   4. read token symbol/decimals on-chain (cached),
 *   5. emit a canonical Claim per token with a positive claimable balance.
 *
 * Read-only: it never executes `processClaim`. Every endpoint/address is
 * injected via `ctx.config` — nothing is hardcoded. Absent config, the
 * connector is inert (returns nothing) rather than failing.
 */

const CLAIM_TYPE_PREFIX = "eigenlayer-rewards";
const TOKEN_META_TTL_SECONDS = 7 * 24 * 60 * 60; // symbol/decimals are immutable

interface EigenLayerConnectorDeps {
  /** Injected for tests; production builds a SidecarProofProvider from config. */
  proofProvider?: EigenLayerProofProvider;
  /** Injected fetch for the default provider (tests never hit the network). */
  fetchImpl?: typeof fetch;
}

interface ResolvedConfig {
  rewardsCoordinator: Address;
  sidecarUrl: string;
  claimUrl: string;
}

interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
}

export class EigenLayerConnector implements DiscoveryConnector {
  readonly metadata: DiscoveryConnectorMetadata;
  readonly version = "1.0.0";
  readonly priority = 80;

  constructor(private readonly deps: EigenLayerConnectorDeps = {}) {
    this.metadata = {
      id: "eigenlayer-rewards",
      displayName: "EigenLayer Rewards",
      protocol: { id: "eigenlayer", name: "EigenLayer" },
    };
  }

  supportedChains(): Chain[] {
    return [Chain.ETHEREUM];
  }

  capabilities(): ConnectorCapabilities {
    return {
      // Hybrid: proof from an off-chain service, but verified on-chain.
      accessMode: "hybrid",
      categories: [ClaimableCategory.STAKING_REWARD],
      gasEstimation: false,
      // Static, deliberately NOT config-driven: the allow-list is a security
      // control and config must not be able to widen it.
      trustedDomains: ["eigenlayer.xyz"],
    };
  }

  async health(ctx: DiscoveryContext): Promise<HealthStatus> {
    const config = this.resolveConfig(ctx);
    if (!config) return { healthy: false, detail: "eigenlayer connector not configured" };
    try {
      const provider = this.provider(config);
      const ok = await provider.health({ signal: ctx.signal });
      return ok ? { healthy: true } : { healthy: false, detail: "sidecar unreachable" };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : "unreachable" };
    }
  }

  async discover(ctx: DiscoveryContext, request: DiscoveryRequest): Promise<DiscoveryResult> {
    const config = this.resolveConfig(ctx);
    if (!config) {
      // Not configured for this environment — nothing to do, not an error.
      ctx.logger.debug("eigenlayer connector unconfigured; skipping");
      return { claims: [] };
    }
    if (!isAddress(request.wallet)) return { claims: [] };
    const wallet = getAddress(request.wallet);

    // 1) Fetch the (untrusted) proof.
    const provider = this.provider(config);
    let proof: RewardsMerkleClaim | null;
    try {
      proof = await provider.getRewardProof(wallet, { signal: ctx.signal });
    } catch (error) {
      if (error instanceof ProofProviderError) {
        // Transport/parse failure — surface as a failed run so the runtime
        // retries and the scan reports it (rather than a silent "nothing").
        throw new ConnectorExecutionError(this.metadata.id, "proof provider failed");
      }
      throw error; // e.g. AbortError — let the runtime classify it
    }
    if (!proof) return { claims: [] };

    // The earner in the proof MUST be the wallet we scanned — never surface a
    // claim keyed to someone else's address.
    if (proof.earnerLeaf.earner.toLowerCase() !== wallet.toLowerCase()) {
      ctx.logger.warn({ wallet }, "proof earner does not match scanned wallet; skipping");
      return { claims: [] };
    }

    ctx.signal?.throwIfAborted();
    const client = ctx.chain(Chain.ETHEREUM);

    // 2) Verify on-chain. `getCurrentDistributionRoot` is a reachability
    // sentinel: with allowFailure, a `checkClaim` revert (invalid proof) comes
    // back as a single failed result and is a clean skip, whereas a dead RPC
    // fails the sentinel too — which we turn into a retryable error so the run
    // is reported rather than silently yielding "no rewards".
    let verified = false;
    let distributionRoot: string | null = null;
    try {
      const [checkResult, rootResult] = await client.multicall({
        allowFailure: true,
        contracts: [
          {
            address: config.rewardsCoordinator,
            abi: REWARDS_COORDINATOR_ABI,
            functionName: "checkClaim",
            args: [proof],
          },
          {
            address: config.rewardsCoordinator,
            abi: REWARDS_COORDINATOR_ABI,
            functionName: "getCurrentDistributionRoot",
          },
        ],
      });
      if (rootResult.status !== "success") {
        throw new ConnectorExecutionError(
          this.metadata.id,
          "on-chain read failed (RewardsCoordinator unreachable)",
        );
      }
      distributionRoot = rootResult.result.root;
      verified = checkResult.status === "success" && checkResult.result === true;
    } catch (error) {
      if (error instanceof ConnectorExecutionError) throw error;
      throw new ConnectorExecutionError(this.metadata.id, "on-chain checkClaim read failed");
    }
    if (!verified) {
      ctx.logger.warn({ wallet }, "eigenlayer proof did not verify on-chain; skipping");
      return { claims: [] };
    }

    // 3) Per-token: how much has already been claimed?
    let claimedAmounts: bigint[];
    try {
      claimedAmounts = await client.multicall({
        allowFailure: false,
        contracts: proof.tokenLeaves.map((leaf) => ({
          address: config.rewardsCoordinator,
          abi: REWARDS_COORDINATOR_ABI,
          functionName: "cumulativeClaimed" as const,
          args: [wallet, leaf.token] as const,
        })),
      });
    } catch {
      throw new ConnectorExecutionError(this.metadata.id, "on-chain cumulativeClaimed read failed");
    }

    // 4) + 5) Build one claim per token with a positive remaining balance.
    const claims: Claim[] = [];
    for (let i = 0; i < proof.tokenLeaves.length; i++) {
      const leaf = proof.tokenLeaves[i]!;
      const claimed = claimedAmounts[i] ?? 0n;
      const claimable = leaf.cumulativeEarnings - claimed;
      if (claimable <= 0n) continue; // fully claimed — nothing to surface

      const meta = await this.tokenMeta(ctx, client, leaf.token);
      claims.push(
        this.buildClaim(
          ctx,
          config,
          wallet,
          proof,
          leaf,
          claimable,
          claimed,
          meta,
          distributionRoot,
        ),
      );
    }
    return { claims };
  }

  // --- helpers -------------------------------------------------------------

  private buildClaim(
    ctx: DiscoveryContext,
    config: ResolvedConfig,
    wallet: Address,
    proof: RewardsMerkleClaim,
    leaf: TokenTreeMerkleLeaf,
    claimable: bigint,
    claimed: bigint,
    meta: TokenMeta,
    distributionRoot: string | null,
  ): Claim {
    const token = getAddress(leaf.token);
    return {
      id: computeClaimId({
        chain: Chain.ETHEREUM,
        protocol: this.metadata.protocol.id,
        contract: config.rewardsCoordinator,
        wallet,
        // token in the claimType keeps multi-token claims distinct + stable.
        claimType: `${CLAIM_TYPE_PREFIX}:${token.toLowerCase()}`,
      }),
      wallet: wallet.toLowerCase(),
      chain: Chain.ETHEREUM,
      protocol: {
        id: this.metadata.protocol.id,
        name: this.metadata.protocol.name,
        priority: this.priority,
      },
      category: ClaimableCategory.STAKING_REWARD,
      claimType: CLAIM_TYPE_PREFIX,
      status: ClaimStatus.CLAIMABLE,
      token: {
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        contractAddress: token,
      },
      amountRaw: claimable.toString(),
      amountDecimal: formatUnits(claimable, meta.decimals),
      usdValue: null, // priced in Phase 2.2
      gasEstimate: null,
      confidence: Confidence.CONFIRMED, // verified on-chain via checkClaim
      riskFlags: [],
      claimUrl: config.claimUrl,
      expiresAt: null, // EigenLayer rewards are cumulative — no claim deadline
      provenance: {
        connectorId: this.metadata.id,
        connectorVersion: this.version,
        source: "hybrid",
        chain: Chain.ETHEREUM,
        contractAddress: config.rewardsCoordinator,
        method: "checkClaim + cumulativeClaimed",
        blockNumber: null,
        discoveredAt: ctx.now().toISOString(),
      },
      metadata: {
        rootIndex: proof.rootIndex,
        distributionRoot,
        cumulativeEarnings: leaf.cumulativeEarnings.toString(),
        cumulativeClaimed: claimed.toString(),
      },
    };
  }

  /** On-chain symbol/decimals, cached (immutable). Resilient to odd tokens. */
  private async tokenMeta(
    ctx: DiscoveryContext,
    client: PublicClient,
    token: Address,
  ): Promise<TokenMeta> {
    const key = `token-meta:${token.toLowerCase()}`;
    return ctx.cache.getOrSet<TokenMeta>(key, TOKEN_META_TTL_SECONDS, async () => {
      try {
        const [symbol, name, decimals] = await client.multicall({
          allowFailure: false,
          contracts: [
            { address: token, abi: erc20Abi, functionName: "symbol" },
            { address: token, abi: erc20Abi, functionName: "name" },
            { address: token, abi: erc20Abi, functionName: "decimals" },
          ],
        });
        return { symbol, name, decimals };
      } catch {
        // A non-standard token must not break discovery: fall back to a safe
        // shorthand. The amount + contract address remain accurate.
        ctx.logger.debug({ token }, "token metadata read failed; using fallback");
        return { symbol: `${token.slice(0, 6)}…`, name: "Unknown token", decimals: 18 };
      }
    });
  }

  private provider(config: ResolvedConfig): EigenLayerProofProvider {
    return (
      this.deps.proofProvider ?? new SidecarProofProvider(config.sidecarUrl, this.deps.fetchImpl)
    );
  }

  private resolveConfig(ctx: DiscoveryContext): ResolvedConfig | null {
    const rewardsCoordinator = ctx.config.rewardsCoordinator;
    const sidecarUrl = ctx.config.sidecarUrl;
    const claimUrl = ctx.config.claimUrl;
    if (!rewardsCoordinator || !sidecarUrl || !claimUrl) return null;
    if (!isAddress(rewardsCoordinator)) return null;
    return { rewardsCoordinator: getAddress(rewardsCoordinator), sidecarUrl, claimUrl };
  }
}
