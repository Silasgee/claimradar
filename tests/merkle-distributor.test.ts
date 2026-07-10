import { describe, expect, it } from "vitest";

import { MerkleDistributorConnector } from "@/connectors/discovery";
import { SAMPLE_MERKLE_ROOT } from "@/connectors/discovery/merkle-distributor/eligibility";
import { ConnectorExecutionError } from "@/connectors";
import { ClaimStatus, Confidence } from "@/types";

import { createDiscoveryTestContext } from "./discovery-helpers";
import { createMockMerkleClient, type MockMerkleOptions } from "./merkle-rpc";

// Sample list: index 0 is this wallet, amount 1000e18.
const ELIGIBLE = "0x000000000000000000000000000000000000beef";
const NOT_ELIGIBLE = "0x0000000000000000000000000000000000000abc";
const WRONG_ROOT = "0x1234567890123456789012345678901234567890123456789012345678901234";

function ctxFor(opts: MockMerkleOptions, config: Record<string, string> = {}) {
  return createDiscoveryTestContext({ chain: () => createMockMerkleClient(opts), config });
}

describe("MerkleDistributorConnector — metadata & capabilities", () => {
  const connector = new MerkleDistributorConnector();

  it("declares onchain access, airdrop category, gas estimation and a trusted domain", () => {
    const caps = connector.capabilities();
    expect(caps.accessMode).toBe("onchain");
    expect(caps.gasEstimation).toBe(true);
    expect(caps.trustedDomains).toContain("claims.example.org");
    expect(connector.supportedChains()).toEqual(["ETHEREUM"]);
    expect(connector.priority).toBeGreaterThan(0);
  });
});

describe("MerkleDistributorConnector — discovery (mocked RPC)", () => {
  it("returns a CONFIRMED CLAIMABLE claim for an eligible, unclaimed wallet", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false, gas: 120_000n });

    const { claims } = await connector.discover(ctx, { wallet: ELIGIBLE });

    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    expect(claim).toMatchObject({
      wallet: ELIGIBLE,
      status: ClaimStatus.CLAIMABLE,
      confidence: Confidence.CONFIRMED,
      amountRaw: "1000000000000000000000",
      amountDecimal: "1000",
    });
    expect(claim.id.startsWith("claim_v1_")).toBe(true);
    expect(claim.claimUrl).toBe("https://claims.example.org/example-merkle");
    expect(claim.provenance).toMatchObject({ source: "onchain", method: "isClaimed(uint256)" });
    expect(claim.gasEstimate).toEqual({ gasLimit: "120000" });
    expect(claim.metadata).toMatchObject({ index: 0, merkleRoot: SAMPLE_MERKLE_ROOT });
  });

  it("reports ALREADY_CLAIMED (and no gas estimate) when isClaimed is true", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: true, gas: 120_000n });

    const { claims } = await connector.discover(ctx, { wallet: ELIGIBLE });
    expect(claims[0]?.status).toBe(ClaimStatus.ALREADY_CLAIMED);
    expect(claims[0]?.gasEstimate).toBeNull();
  });

  it("reports EXPIRED when the configured claim deadline has passed", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor(
      { merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false },
      { claimDeadline: "2020-01-01T00:00:00.000Z" },
    );

    const { claims } = await connector.discover(ctx, { wallet: ELIGIBLE });
    expect(claims[0]?.status).toBe(ClaimStatus.EXPIRED);
  });

  it("still returns the claim (gasEstimate null) when gas estimation fails", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false }); // no gas => estimation reverts

    const { claims } = await connector.discover(ctx, { wallet: ELIGIBLE });
    expect(claims[0]?.status).toBe(ClaimStatus.CLAIMABLE);
    expect(claims[0]?.gasEstimate).toBeNull();
  });

  it("returns nothing for a wallet not on the eligibility list", async () => {
    const connector = new MerkleDistributorConnector();
    // chain intentionally unstubbed — an ineligible wallet must not touch it.
    const ctx = createDiscoveryTestContext();

    const { claims } = await connector.discover(ctx, { wallet: NOT_ELIGIBLE });
    expect(claims).toEqual([]);
  });

  it("emits no claim when the proof does not verify against the on-chain root", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor({ merkleRoot: WRONG_ROOT, claimed: false });

    const { claims } = await connector.discover(ctx, { wallet: ELIGIBLE });
    expect(claims).toEqual([]);
  });

  it("throws a ConnectorError when on-chain reads fail", async () => {
    const connector = new MerkleDistributorConnector();
    const ctx = ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false, failReads: true });

    await expect(connector.discover(ctx, { wallet: ELIGIBLE })).rejects.toBeInstanceOf(
      ConnectorExecutionError,
    );
  });

  it("health() reports healthy when merkleRoot is readable", async () => {
    const connector = new MerkleDistributorConnector();
    const healthy = await connector.health(
      ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false }),
    );
    expect(healthy.healthy).toBe(true);

    const unhealthy = await connector.health(
      ctxFor({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false, failReads: true }),
    );
    expect(unhealthy.healthy).toBe(false);
  });
});
