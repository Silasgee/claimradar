import type { Connector, ConnectorContext, ConnectorMetadata } from "@/connectors/connector";
import {
  Chain,
  ClaimableCategory,
  Confidence,
  type Claimable,
  type ScanRequest,
  type ScanResponse,
} from "@/types";

/**
 * MockConnector — a deterministic, dependency-free connector used to exercise
 * the SDK, the registry, and (in later milestones) the scan pipeline without
 * any blockchain access.
 *
 * Determinism contract: for a given address, `scan()` always returns the same
 * claimables. Amounts are derived from a stable hash of the address, and
 * timestamps come from the injected clock (`ctx.now`), never the wall clock.
 */

/** Stable 32-bit FNV-1a hash — deterministic across runs and platforms. */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const METADATA: ConnectorMetadata = {
  id: "mock",
  displayName: "Mock Protocol",
  version: "1.0.0",
  category: ClaimableCategory.AIRDROP,
  chains: [Chain.ETHEREUM],
};

export class MockConnector implements Connector {
  readonly metadata = METADATA;

  supports(request: ScanRequest): boolean {
    if (request.chains && !request.chains.includes(Chain.ETHEREUM)) {
      return false;
    }
    // EVM-shaped addresses only.
    return /^0x[0-9a-fA-F]{40}$/.test(request.address);
  }

  async scan(ctx: ConnectorContext, request: ScanRequest): Promise<ScanResponse> {
    const address = request.address.toLowerCase();
    const seed = stableHash(address);

    // Deterministic fake amounts derived from the address.
    const airdropAmount = (seed % 9_000) + 1_000; // 1 000 – 9 999 MOCK
    const rewardWei = BigInt(seed % 1_000_000) * 10n ** 12n; // < 0.001 ETH

    const claimables: Claimable[] = [
      {
        id: `mock:${address}:airdrop`,
        connectorId: this.metadata.id,
        chain: Chain.ETHEREUM,
        category: ClaimableCategory.AIRDROP,
        token: {
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 18,
          contractAddress: "0x0000000000000000000000000000000000000001",
        },
        amountRaw: (BigInt(airdropAmount) * 10n ** 18n).toString(),
        amountDecimal: airdropAmount.toFixed(2),
        usdValue: null,
        claimUrl: "https://claims.example.com/mock",
        contractAddress: "0x0000000000000000000000000000000000000002",
        expiresAt: null,
        confidence: Confidence.CONFIRMED,
        riskFlags: [],
      },
      {
        id: `mock:${address}:staking`,
        connectorId: this.metadata.id,
        chain: Chain.ETHEREUM,
        category: ClaimableCategory.STAKING_REWARD,
        token: { symbol: "ETH", name: "Ether", decimals: 18, contractAddress: null },
        amountRaw: rewardWei.toString(),
        amountDecimal: (Number(rewardWei) / 1e18).toFixed(6),
        usdValue: null,
        claimUrl: "https://claims.example.com/mock/staking",
        contractAddress: "0x0000000000000000000000000000000000000003",
        expiresAt: null,
        confidence: Confidence.CONFIRMED,
        riskFlags: [],
      },
    ];

    ctx.logger.debug(
      { connectorId: this.metadata.id, address, found: claimables.length },
      "mock scan complete",
    );

    return {
      connectorId: this.metadata.id,
      address: request.address,
      claimables,
      scannedAt: ctx.now().toISOString(),
    };
  }
}
