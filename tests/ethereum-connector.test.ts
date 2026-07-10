import { parseEther, parseUnits } from "viem";
import { describe, expect, it } from "vitest";

import { EthereumConnector } from "@/connectors";
import { ConnectorRegistry } from "@/connectors";
import { InMemoryCacheStore } from "@/lib/cache";
import { ScanMetrics, ScanService } from "@/lib/scan";
import { Chain, ClaimableCategory, Confidence, ConnectorRunStatus, ScanStatus } from "@/types";

import { createMockEthereumClient, mockChainAccess, type MockRpcOptions } from "./ethereum-rpc";
import { TEST_ADDRESS, createTestContext, createTestLogger, testRequest } from "./helpers";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";

function connectorContext(rpc: MockRpcOptions) {
  const client = createMockEthereumClient(rpc);
  return createTestContext({ chain: () => client });
}

function serviceWith(
  rpc: MockRpcOptions,
  options: ConstructorParameters<typeof ScanService>[1] = {},
) {
  const registry = new ConnectorRegistry();
  registry.register(new EthereumConnector());
  const metrics = new ScanMetrics();
  const service = new ScanService(
    {
      registry,
      metrics,
      logger: createTestLogger(),
      cacheFactory: () => new InMemoryCacheStore(),
      chainAccess: mockChainAccess(createMockEthereumClient(rpc)),
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    },
    { backoffBaseMs: 1, maxBackoffMs: 2, ...options },
  );
  return { service, metrics };
}

describe("EthereumConnector — supports()", () => {
  const connector = new EthereumConnector();

  it("accepts EVM addresses on Ethereum, rejects everything else", () => {
    expect(connector.supports({ address: TEST_ADDRESS })).toBe(true);
    expect(connector.supports({ address: TEST_ADDRESS, chains: [Chain.ETHEREUM] })).toBe(true);
    expect(connector.supports({ address: TEST_ADDRESS, chains: [Chain.SOLANA] })).toBe(false);
    expect(connector.supports({ address: "not-an-address" })).toBe(false);
    expect(connector.supports({ address: "0x1234" })).toBe(false);
  });
});

describe("EthereumConnector — balance reads (mocked RPC)", () => {
  it("returns native ETH and non-zero ERC-20 balances as CONFIRMED claimables, skipping zeros", async () => {
    const connector = new EthereumConnector();
    const ctx = connectorContext({
      nativeBalance: parseEther("1.5"),
      tokenBalances: {
        [USDC]: parseUnits("2.5", 6),
        [DAI]: 0n, // explicit zero — must be skipped
      },
    });

    const response = await connector.scan(ctx, testRequest);

    expect(response.connectorId).toBe("ethereum-assets");
    expect(response.claimables).toHaveLength(2);

    const native = response.claimables.find((c) => c.token.symbol === "ETH");
    expect(native).toMatchObject({
      chain: Chain.ETHEREUM,
      category: ClaimableCategory.OTHER,
      amountRaw: parseEther("1.5").toString(),
      amountDecimal: "1.5",
      usdValue: null,
      confidence: Confidence.CONFIRMED,
      token: { symbol: "ETH", decimals: 18, contractAddress: null },
    });
    expect(native?.claimUrl).toMatch(/^https:\/\/etherscan\.io\/address\//);

    const usdc = response.claimables.find((c) => c.token.symbol === "USDC");
    expect(usdc).toMatchObject({
      amountRaw: "2500000",
      amountDecimal: "2.5",
      token: { symbol: "USDC", decimals: 6 },
    });
    expect(usdc?.contractAddress.toLowerCase()).toBe(USDC);
  });

  it("batches all token reads into a single multicall: exactly 2 RPC requests total", async () => {
    const methods: string[] = [];
    const connector = new EthereumConnector();
    const ctx = connectorContext({
      nativeBalance: parseEther("1"),
      tokenBalances: { [USDC]: 1n },
      onRequest: (m) => methods.push(m),
    });

    await connector.scan(ctx, testRequest);

    expect(methods.filter((m) => m === "eth_getBalance")).toHaveLength(1);
    expect(methods.filter((m) => m === "eth_call")).toHaveLength(1);
    expect(methods).toHaveLength(2);
  });

  it("skips tokens whose balanceOf fails and keeps the rest (per-token isolation)", async () => {
    const connector = new EthereumConnector();
    const ctx = connectorContext({
      nativeBalance: 0n,
      tokenBalances: { [USDC]: parseUnits("9", 6), [USDT]: parseUnits("7", 6) },
      failTokens: [USDT],
    });

    const response = await connector.scan(ctx, testRequest);

    expect(response.claimables.map((c) => c.token.symbol)).toEqual(["USDC"]);
  });

  it("returns an empty claimables list for an empty wallet", async () => {
    const connector = new EthereumConnector();
    const ctx = connectorContext({ nativeBalance: 0n });

    const response = await connector.scan(ctx, testRequest);
    expect(response.claimables).toEqual([]);
  });
});

describe("EthereumConnector — through the full scan pipeline", () => {
  it("produces a COMPLETE report with deterministic ordering and metrics", async () => {
    const { service, metrics } = serviceWith({
      nativeBalance: parseEther("1.5"),
      tokenBalances: { [USDC]: parseUnits("2.5", 6) },
    });

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    // All usdValue are null → ordered by decimal amount desc: USDC 2.5 > ETH 1.5.
    expect(report.claimables.map((c) => c.token.symbol)).toEqual(["USDC", "ETH"]);
    expect(report.connectorRuns).toEqual([
      expect.objectContaining({
        connectorId: "ethereum-assets",
        status: ConnectorRunStatus.SUCCESS,
        itemsFound: 2,
      }),
    ]);
    expect(metrics.snapshot().connectors["ethereum-assets"]?.successRate).toBe(1);
  });

  it("never throws on RPC outage: retries per policy, then reports FAILED", async () => {
    const { service, metrics } = serviceWith({ failRpc: true }, { maxRetries: 2 });

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns[0]).toMatchObject({
      status: ConnectorRunStatus.FAILED,
      attempts: 3, // initial + 2 retries — retry policy respected
    });
    expect(report.connectorRuns[0]?.error?.code).toBe("CONNECTOR_EXECUTION_ERROR");
    expect(metrics.snapshot().connectors["ethereum-assets"]?.retries).toBe(2);
  });

  it("times out a hung RPC at the per-attempt deadline", async () => {
    const { service } = serviceWith({ hang: true }, { timeoutMs: 30, maxRetries: 0 });

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns[0]?.status).toBe(ConnectorRunStatus.TIMEOUT);
    expect(report.durationMs).toBeLessThan(500);
  });

  it("honors caller cancellation mid-scan", async () => {
    const { service } = serviceWith({ hang: true }, { timeoutMs: 5_000 });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const report = await service.scan(testRequest, { signal: controller.signal });

    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns[0]?.status).toBe(ConnectorRunStatus.CANCELLED);
  });
});
