import { formatUnits, getAddress, type Address, type Hex } from "viem";

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

import { MERKLE_DISTRIBUTOR_ABI } from "./abi";
import { findEligibility, type EligibilityEntry } from "./eligibility";
import { computeLeaf, verifyProof } from "./merkle";

/**
 * Merkle Distributor discovery connector (Milestone 3, Phase 5).
 *
 * The reference production connector: a Uniswap-style Merkle Distributor with
 * publicly verifiable eligibility. For a wallet it:
 *   1. detects eligibility from the protocol's published claims list,
 *   2. reads `merkleRoot()` + `isClaimed(index)` on-chain (ONE multicall),
 *   3. verifies the wallet's proof against the on-chain root (ground truth),
 *   4. determines status (claimable / already-claimed / expired),
 *   5. estimates gas for the claim (best-effort),
 *   6. returns a canonical Claim with provenance, official URL, and confidence.
 *
 * It contains ONLY business logic. It reaches the chain solely via
 * `ctx.chain()` and never constructs a client, reads env, or bypasses the
 * injected logger/cache. Read-only: it never executes `claim`.
 */

const CLAIM_TYPE = "merkle-airdrop";

// Documented example defaults — override per deployment via ctx.config. The
// default distributor address is a real, publicly verifiable mainnet contract;
// the bundled sample list will not match its real root, so against it the
// connector correctly yields nothing (no false positives).
const DEFAULTS = {
  distributorAddress: "0x090D4613473dEE047c3f2706764f49E0821D256e",
  protocolId: "example-merkle",
  protocolName: "Example Merkle Airdrop",
  claimUrl: "https://claims.example.org/example-merkle",
  trustedDomain: "claims.example.org",
  tokenSymbol: "EXMP",
  tokenName: "Example Token",
  tokenDecimals: "18",
} as const;

export class MerkleDistributorConnector implements DiscoveryConnector {
  readonly metadata: DiscoveryConnectorMetadata;
  readonly version = "1.0.0";
  readonly priority = 70;

  constructor() {
    this.metadata = {
      id: "merkle-distributor",
      displayName: "Merkle Distributor Airdrop",
      protocol: { id: DEFAULTS.protocolId, name: DEFAULTS.protocolName },
    };
  }

  supportedChains(): Chain[] {
    return [Chain.ETHEREUM];
  }

  capabilities(): ConnectorCapabilities {
    return {
      accessMode: "onchain",
      categories: [ClaimableCategory.AIRDROP],
      gasEstimation: true,
      trustedDomains: [DEFAULTS.trustedDomain],
    };
  }

  async health(ctx: DiscoveryContext): Promise<HealthStatus> {
    try {
      const client = ctx.chain(Chain.ETHEREUM);
      await client.readContract({
        address: this.distributorAddress(ctx),
        abi: MERKLE_DISTRIBUTOR_ABI,
        functionName: "merkleRoot",
      });
      return { healthy: true };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : "unreachable" };
    }
  }

  async discover(ctx: DiscoveryContext, request: DiscoveryRequest): Promise<DiscoveryResult> {
    const wallet = request.wallet.toLowerCase() as Address;
    const entry = findEligibility(wallet);
    if (!entry) {
      // Not on the list — nothing to claim. The common case; not an error.
      return { claims: [] };
    }

    ctx.signal?.throwIfAborted();
    const client = ctx.chain(Chain.ETHEREUM);
    const distributor = this.distributorAddress(ctx);

    // One multicall: merkleRoot() + isClaimed(index).
    const [rootResult, claimedResult] = await client.multicall({
      allowFailure: true,
      contracts: [
        { address: distributor, abi: MERKLE_DISTRIBUTOR_ABI, functionName: "merkleRoot" },
        {
          address: distributor,
          abi: MERKLE_DISTRIBUTOR_ABI,
          functionName: "isClaimed",
          args: [BigInt(entry.index)],
        },
      ],
    });

    if (rootResult.status !== "success" || claimedResult.status !== "success") {
      // Upstream read failure — throw so the runtime retries / marks the run failed.
      throw new ConnectorExecutionError(
        this.metadata.id,
        "failed to read distributor state (merkleRoot/isClaimed)",
      );
    }

    const onChainRoot = rootResult.result as Hex;
    const alreadyClaimed = claimedResult.result as boolean;

    // Verify the wallet's proof against the ON-CHAIN root. Mismatch => the
    // bundled list doesn't match this distributor; do not emit a claim.
    const leaf = computeLeaf({
      index: entry.index,
      account: entry.account,
      amountRaw: entry.amountRaw,
    });
    const leafOk = verifyProof(leaf, entry.proof, onChainRoot);
    if (!leafOk) {
      ctx.logger.warn(
        { wallet, distributor, index: entry.index },
        "merkle proof did not verify against on-chain root; skipping",
      );
      return { claims: [] };
    }

    const status = this.resolveStatus(ctx, alreadyClaimed);
    const gasEstimate =
      status === ClaimStatus.CLAIMABLE
        ? await this.estimateGas(ctx, distributor, wallet, entry)
        : null;

    return {
      claims: [this.buildClaim(ctx, distributor, wallet, entry, status, onChainRoot, gasEstimate)],
    };
  }

  // --- helpers -------------------------------------------------------------

  private resolveStatus(ctx: DiscoveryContext, alreadyClaimed: boolean): ClaimStatus {
    if (alreadyClaimed) return ClaimStatus.ALREADY_CLAIMED;
    const deadline = ctx.config.claimDeadline;
    if (deadline) {
      const end = Date.parse(deadline);
      if (Number.isFinite(end) && end < ctx.now().getTime()) return ClaimStatus.EXPIRED;
    }
    return ClaimStatus.CLAIMABLE;
  }

  private async estimateGas(
    ctx: DiscoveryContext,
    distributor: Address,
    wallet: Address,
    entry: EligibilityEntry,
  ): Promise<{ gasLimit: string } | null> {
    try {
      ctx.signal?.throwIfAborted();
      const gas = await ctx.chain(Chain.ETHEREUM).estimateContractGas({
        address: distributor,
        abi: MERKLE_DISTRIBUTOR_ABI,
        functionName: "claim",
        args: [BigInt(entry.index), wallet, BigInt(entry.amountRaw), entry.proof],
        account: wallet,
      });
      return { gasLimit: gas.toString() };
    } catch (error) {
      // Gas estimation is best-effort — a revert or RPC hiccup must not fail
      // discovery. Absence of an estimate is a valid, expected outcome.
      ctx.logger.debug({ err: error }, "gas estimation unavailable");
      return null;
    }
  }

  private buildClaim(
    ctx: DiscoveryContext,
    distributor: Address,
    wallet: Address,
    entry: EligibilityEntry,
    status: ClaimStatus,
    root: Hex,
    gasEstimate: { gasLimit: string } | null,
  ): Claim {
    const decimals = Number.parseInt(ctx.config.tokenDecimals ?? DEFAULTS.tokenDecimals, 10);
    const protocolId = ctx.config.protocolId ?? DEFAULTS.protocolId;
    const deadline = ctx.config.claimDeadline ?? null;

    return {
      id: computeClaimId({
        chain: Chain.ETHEREUM,
        protocol: protocolId,
        contract: distributor,
        wallet,
        claimType: CLAIM_TYPE,
      }),
      wallet,
      chain: Chain.ETHEREUM,
      protocol: {
        id: protocolId,
        name: ctx.config.protocolName ?? DEFAULTS.protocolName,
        priority: this.priority,
      },
      category: ClaimableCategory.AIRDROP,
      claimType: CLAIM_TYPE,
      status,
      token: {
        symbol: ctx.config.tokenSymbol ?? DEFAULTS.tokenSymbol,
        name: ctx.config.tokenName ?? DEFAULTS.tokenName,
        decimals,
        contractAddress: null,
      },
      amountRaw: entry.amountRaw,
      amountDecimal: formatUnits(BigInt(entry.amountRaw), decimals),
      usdValue: null,
      gasEstimate,
      confidence: Confidence.CONFIRMED, // on-chain root + isClaimed verified
      riskFlags: [],
      claimUrl: ctx.config.claimUrl ?? DEFAULTS.claimUrl,
      expiresAt: deadline,
      provenance: {
        connectorId: this.metadata.id,
        connectorVersion: this.version,
        source: "onchain",
        chain: Chain.ETHEREUM,
        contractAddress: distributor,
        method: "isClaimed(uint256)",
        blockNumber: null,
        discoveredAt: ctx.now().toISOString(),
      },
      metadata: { index: entry.index, merkleRoot: root },
    };
  }

  private distributorAddress(ctx: DiscoveryContext): Address {
    return getAddress(ctx.config.distributorAddress ?? DEFAULTS.distributorAddress);
  }
}
