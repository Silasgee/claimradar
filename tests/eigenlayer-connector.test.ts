import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { EigenLayerConnector } from "@/connectors/discovery";
import { ProofProviderError } from "@/connectors/discovery/eigenlayer/proof-provider";
import type {
  RewardsMerkleClaim,
  TokenTreeMerkleLeaf,
} from "@/connectors/discovery/eigenlayer/types";
import { ConnectorExecutionError } from "@/connectors";
import { ClaimableCategory, ClaimStatus, Confidence } from "@/types";

import { createDiscoveryTestContext } from "./discovery-helpers";
import { createMockEigenClient, StubProofProvider, type MockEigenOptions } from "./eigenlayer-rpc";

const COORDINATOR = "0x7750d328b314EfFa365A0402CcfD489B80B0adda";
const EARNER = "0x000000000000000000000000000000000000bEEF";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

const CONFIG = {
  rewardsCoordinator: COORDINATOR,
  sidecarUrl: "https://sidecar.example",
  claimUrl: "https://app.eigenlayer.xyz/rewards",
};

function leaf(token: string, cumulativeEarnings: bigint): TokenTreeMerkleLeaf {
  return { token: getAddress(token), cumulativeEarnings };
}

function makeProof(
  tokenLeaves: TokenTreeMerkleLeaf[],
  earner: string = EARNER,
): RewardsMerkleClaim {
  return {
    rootIndex: 5,
    earnerIndex: 42,
    earnerTreeProof: `0x${"aa".repeat(32)}`,
    earnerLeaf: { earner: getAddress(earner) as Address, earnerTokenRoot: `0x${"bb".repeat(32)}` },
    tokenIndices: tokenLeaves.map((_, i) => i),
    tokenTreeProofs: tokenLeaves.map((): Hex => `0x${"cc".repeat(32)}`),
    tokenLeaves,
  };
}

function connectorWith(proof: RewardsMerkleClaim | null, providerOpts = {}) {
  return new EigenLayerConnector({ proofProvider: new StubProofProvider(proof, providerOpts) });
}

function ctxFor(opts: MockEigenOptions, config: Record<string, string> = CONFIG) {
  return createDiscoveryTestContext({ chain: () => createMockEigenClient(opts), config });
}

describe("EigenLayerConnector — metadata & capabilities", () => {
  const connector = new EigenLayerConnector();

  it("declares hybrid access, staking-reward category, and the eigenlayer domain", () => {
    const caps = connector.capabilities();
    expect(caps.accessMode).toBe("hybrid");
    expect(caps.categories).toEqual([ClaimableCategory.STAKING_REWARD]);
    expect(caps.trustedDomains).toContain("eigenlayer.xyz");
    expect(connector.supportedChains()).toEqual(["ETHEREUM"]);
    expect(connector.priority).toBeGreaterThan(0);
  });
});

describe("EigenLayerConnector — discovery (mocked RPC + proof provider)", () => {
  it("returns a CONFIRMED CLAIMABLE claim for an eligible earner", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 12_500000000000000000n)]));
    const ctx = ctxFor({
      checkClaim: true,
      tokenMeta: { [TOKEN_A.toLowerCase()]: { symbol: "EIGEN", name: "Eigen", decimals: 18 } },
    });

    const { claims } = await connector.discover(ctx, { wallet: EARNER });

    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    expect(claim).toMatchObject({
      wallet: EARNER.toLowerCase(),
      status: ClaimStatus.CLAIMABLE,
      confidence: Confidence.CONFIRMED,
      category: ClaimableCategory.STAKING_REWARD,
      amountRaw: "12500000000000000000",
      amountDecimal: "12.5",
    });
    expect(claim.token).toMatchObject({
      symbol: "EIGEN",
      decimals: 18,
      contractAddress: getAddress(TOKEN_A),
    });
    expect(claim.claimUrl).toBe(CONFIG.claimUrl);
    expect(claim.id.startsWith("claim_v1_")).toBe(true);
    expect(claim.provenance).toMatchObject({
      source: "hybrid",
      method: "checkClaim + cumulativeClaimed",
    });
    expect(claim.metadata).toMatchObject({
      cumulativeEarnings: "12500000000000000000",
      cumulativeClaimed: "0",
    });
  });

  it("subtracts cumulativeClaimed from cumulativeEarnings", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 12_500000000000000000n)]));
    const ctx = ctxFor({
      checkClaim: true,
      claimed: { [TOKEN_A.toLowerCase()]: 2_500000000000000000n },
    });

    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims[0]?.amountDecimal).toBe("10");
    expect(claims[0]?.amountRaw).toBe("10000000000000000000");
  });

  it("emits nothing for a fully-claimed reward (claimable == 0)", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 5_000000000000000000n)]));
    const ctx = ctxFor({
      checkClaim: true,
      claimed: { [TOKEN_A.toLowerCase()]: 5_000000000000000000n },
    });

    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims).toEqual([]);
  });

  it("returns one claim per token with a positive balance, with distinct ids", async () => {
    const connector = connectorWith(
      makeProof([leaf(TOKEN_A, 10_000000000000000000n), leaf(TOKEN_B, 3_000000000000000000n)]),
    );
    const ctx = ctxFor({
      checkClaim: true,
      tokenMeta: {
        [TOKEN_A.toLowerCase()]: { symbol: "EIGEN", name: "Eigen", decimals: 18 },
        [TOKEN_B.toLowerCase()]: { symbol: "AVS", name: "Avs Token", decimals: 18 },
      },
    });

    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((c) => c.id)).size).toBe(2);
    expect(claims.map((c) => c.token.symbol).sort()).toEqual(["AVS", "EIGEN"]);
  });

  it("falls back to a safe token symbol when ERC-20 metadata is unreadable", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 1_000000000000000000n)]));
    const ctx = ctxFor({ checkClaim: true, failTokenMeta: true });

    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims).toHaveLength(1);
    expect(claims[0]?.token.decimals).toBe(18);
    expect(claims[0]?.token.symbol).toContain("…");
    expect(claims[0]?.amountDecimal).toBe("1");
  });

  it("emits NOTHING when the proof does not verify on-chain (checkClaim reverts)", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)]));
    const { claims } = await connector.discover(ctxFor({ checkClaim: "revert" }), {
      wallet: EARNER,
    });
    expect(claims).toEqual([]);
  });

  it("emits NOTHING when checkClaim returns false", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)]));
    const { claims } = await connector.discover(ctxFor({ checkClaim: false }), { wallet: EARNER });
    expect(claims).toEqual([]);
  });

  it("emits NOTHING when the proof's earner does not match the scanned wallet", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)], TOKEN_B /* wrong earner */));
    const { claims } = await connector.discover(ctxFor({ checkClaim: true }), { wallet: EARNER });
    expect(claims).toEqual([]);
  });

  it("returns nothing when the earner has no proof (no rewards)", async () => {
    const connector = connectorWith(null);
    // chain intentionally unstubbed — a no-rewards earner must not touch it.
    const ctx = createDiscoveryTestContext({ config: CONFIG });
    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims).toEqual([]);
  });

  it("throws a ConnectorError when the proof provider fails", async () => {
    const connector = connectorWith(null, { throwError: new ProofProviderError("sidecar down") });
    const ctx = createDiscoveryTestContext({ config: CONFIG });
    await expect(connector.discover(ctx, { wallet: EARNER })).rejects.toBeInstanceOf(
      ConnectorExecutionError,
    );
  });

  it("throws a ConnectorError when on-chain reads fail", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)]));
    const ctx = ctxFor({ checkClaim: true, failReads: true });
    await expect(connector.discover(ctx, { wallet: EARNER })).rejects.toBeInstanceOf(
      ConnectorExecutionError,
    );
  });

  it("returns nothing for a malformed address (never touches chain or provider)", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)]));
    const ctx = createDiscoveryTestContext({ config: CONFIG });
    const { claims } = await connector.discover(ctx, { wallet: "not-an-address" });
    expect(claims).toEqual([]);
  });

  it("is inert (returns nothing) when unconfigured", async () => {
    const connector = connectorWith(makeProof([leaf(TOKEN_A, 9n)]));
    const ctx = createDiscoveryTestContext({ config: {} }); // no rewardsCoordinator/sidecarUrl/claimUrl
    const { claims } = await connector.discover(ctx, { wallet: EARNER });
    expect(claims).toEqual([]);
  });

  it("produces a stable, deterministic id across runs", async () => {
    const mk = () => connectorWith(makeProof([leaf(TOKEN_A, 7_000000000000000000n)]));
    const run = () => mk().discover(ctxFor({ checkClaim: true }), { wallet: EARNER });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.claims[0]?.id).toBe(b.claims[0]?.id);
  });
});

describe("EigenLayerConnector — health", () => {
  it("is unhealthy when unconfigured", async () => {
    const connector = new EigenLayerConnector();
    const health = await connector.health(createDiscoveryTestContext({ config: {} }));
    expect(health.healthy).toBe(false);
  });

  it("is healthy when configured and the provider is reachable", async () => {
    const connector = connectorWith(null, { healthy: true });
    const health = await connector.health(createDiscoveryTestContext({ config: CONFIG }));
    expect(health.healthy).toBe(true);
  });
});
