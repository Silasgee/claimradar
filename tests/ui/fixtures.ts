import {
  Chain,
  ClaimableCategory,
  ClaimStatus,
  Confidence,
  ConnectorRunStatus,
  ScanStatus,
  type DiscoveryReport,
  type RankedClaim,
} from "@/types";

export function makeRankedClaim(overrides: Partial<RankedClaim> = {}): RankedClaim {
  return {
    id: "claim_v1_test",
    wallet: "0x000000000000000000000000000000000000beef",
    chain: Chain.ETHEREUM,
    protocol: { id: "example-merkle", name: "Example Merkle Airdrop", priority: 70 },
    category: ClaimableCategory.AIRDROP,
    claimType: "merkle-airdrop",
    status: ClaimStatus.CLAIMABLE,
    token: { symbol: "EXMP", name: "Example Token", decimals: 18, contractAddress: null },
    amountRaw: "1000000000000000000000",
    amountDecimal: "1000",
    usdValue: null,
    gasEstimate: { gasLimit: "120000" },
    confidence: Confidence.CONFIRMED,
    riskFlags: [],
    claimUrl: "https://claims.example.org/example-merkle",
    expiresAt: null,
    provenance: {
      connectorId: "merkle-distributor",
      connectorVersion: "1.0.0",
      source: "onchain",
      chain: Chain.ETHEREUM,
      contractAddress: "0x090D4613473dEE047c3f2706764f49E0821D256e",
      method: "isClaimed(uint256)",
      blockNumber: null,
      discoveredAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: { index: 0 },
    rank: 1,
    rankScore: 1370,
    ...overrides,
  };
}

export function makeReport(
  claims: RankedClaim[],
  overrides: Partial<DiscoveryReport> = {},
): DiscoveryReport {
  return {
    discoveryId: "disc_test_1234",
    wallet: "0x000000000000000000000000000000000000beef",
    status: ScanStatus.COMPLETE,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 820,
    claims,
    connectorRuns: [
      {
        connectorId: "merkle-distributor",
        protocolId: "example-merkle",
        status: ConnectorRunStatus.SUCCESS,
        attempts: 1,
        durationMs: 800,
        claimsFound: claims.length,
      },
    ],
    stats: { discovered: claims.length, duplicatesRemoved: 0, dropped: 0, rankingDurationMs: 1 },
    ...overrides,
  };
}
