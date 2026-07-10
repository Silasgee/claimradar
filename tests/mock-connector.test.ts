import { describe, expect, it } from "vitest";

import { ConnectorRegistry, MockConnector, createDefaultRegistry } from "@/connectors";
import type { ConnectorContext } from "@/connectors";
import { InMemoryCacheStore } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { Chain, ClaimableCategory } from "@/types";

/** Fully deterministic context: fixed clock, in-memory cache, silent logger. */
function createTestContext(): ConnectorContext {
  const logger = createLogger({ test: true });
  logger.level = "silent";
  return {
    logger,
    cache: new InMemoryCacheStore(),
    config: {},
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

const ADDRESS = "0x000000000000000000000000000000000000beef";

describe("MockConnector", () => {
  it("returns the expected deterministic response for a fixed address and clock", async () => {
    const connector = new MockConnector();
    const ctx = createTestContext();

    const first = await connector.scan(ctx, { address: ADDRESS });
    const second = await connector.scan(ctx, { address: ADDRESS });

    // Determinism: identical input → identical output, byte for byte.
    expect(second).toEqual(first);

    // Shape and provenance.
    expect(first.connectorId).toBe("mock");
    expect(first.address).toBe(ADDRESS);
    expect(first.scannedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(first.claimables).toHaveLength(2);

    const [airdrop, staking] = first.claimables;
    expect(airdrop).toMatchObject({
      id: `mock:${ADDRESS}:airdrop`,
      connectorId: "mock",
      chain: Chain.ETHEREUM,
      category: ClaimableCategory.AIRDROP,
      token: { symbol: "MOCK", decimals: 18 },
    });
    expect(staking).toMatchObject({
      id: `mock:${ADDRESS}:staking`,
      category: ClaimableCategory.STAKING_REWARD,
      token: { symbol: "ETH", contractAddress: null },
    });

    // Amounts are deterministic functions of the address.
    expect(airdrop?.amountRaw).toBe(
      (BigInt(airdrop!.amountDecimal.split(".")[0]!) * 10n ** 18n).toString(),
    );
    expect(BigInt(airdrop!.amountRaw)).toBeGreaterThan(0n);
  });

  it("only supports EVM-shaped addresses on Ethereum", () => {
    const connector = new MockConnector();
    expect(connector.supports({ address: ADDRESS })).toBe(true);
    expect(connector.supports({ address: ADDRESS, chains: [Chain.ETHEREUM] })).toBe(true);
    expect(connector.supports({ address: ADDRESS, chains: [Chain.SOLANA] })).toBe(false);
    expect(connector.supports({ address: "not-an-address" })).toBe(false);
  });

  it("is discoverable through the registry fan-out", () => {
    const registry: ConnectorRegistry = createDefaultRegistry();
    const applicable = registry.forRequest({ address: ADDRESS });
    expect(applicable.map((c) => c.metadata.id)).toContain("mock");
  });
});
