import { describe, expect, it } from "vitest";

import { ConnectorRegistry, MockConnector } from "@/connectors";
import { InMemoryCacheStore } from "@/lib/cache";
import { ValidationError } from "@/lib/errors";
import { ScanMetrics, ScanService } from "@/lib/scan";
import { ConnectorRunStatus, ScanStatus, type Claimable } from "@/types";

import {
  StubConnector,
  TEST_ADDRESS,
  createTestLogger,
  makeClaimable,
  testRequest,
} from "./helpers";

function createService(
  connectors: Array<StubConnector | MockConnector>,
  options: ConstructorParameters<typeof ScanService>[1] = {},
) {
  const registry = new ConnectorRegistry();
  for (const connector of connectors) registry.register(connector);
  const metrics = new ScanMetrics();
  const service = new ScanService(
    {
      registry,
      metrics,
      logger: createTestLogger(),
      cacheFactory: () => new InMemoryCacheStore(),
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    },
    { backoffBaseMs: 1, maxBackoffMs: 2, ...options },
  );
  return { service, metrics };
}

describe("ScanService — successful scans", () => {
  it("runs the full pipeline with the MockConnector and returns a COMPLETE report", async () => {
    const { service, metrics } = createService([new MockConnector()]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.address).toBe(TEST_ADDRESS);
    expect(report.scanId).toBeTruthy();
    expect(report.claimables).toHaveLength(2);
    expect(report.connectorRuns).toEqual([
      expect.objectContaining({
        connectorId: "mock",
        status: ConnectorRunStatus.SUCCESS,
        attempts: 1,
        itemsFound: 2,
      }),
    ]);

    const snapshot = metrics.snapshot();
    expect(snapshot.scans.total).toBe(1);
    expect(snapshot.scans.byStatus[ScanStatus.COMPLETE]).toBe(1);
    expect(snapshot.scans.claimablesFound).toBe(2);
    expect(snapshot.connectors["mock"]?.successRate).toBe(1);
  });

  it("returns COMPLETE with no claimables when no connector supports the request", async () => {
    const { service } = createService([new StubConnector({ id: "opt-out", supports: false })]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.claimables).toEqual([]);
    expect(report.connectorRuns).toEqual([]);
  });

  it("rejects a blank address with ValidationError", async () => {
    const { service } = createService([new MockConnector()]);
    await expect(service.scan({ address: "   " })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ScanService — partial failure and isolation", () => {
  it("returns PARTIAL with surviving claimables when some connectors fail", async () => {
    const healthy = new StubConnector({
      id: "healthy",
      claimables: [makeClaimable({ id: "healthy:1", connectorId: "healthy" })],
    });
    const broken = new StubConnector({ id: "broken", failTimes: Number.POSITIVE_INFINITY });
    const { service, metrics } = createService([healthy, broken]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.PARTIAL);
    expect(report.claimables.map((c) => c.id)).toEqual(["healthy:1"]);

    const brokenRun = report.connectorRuns.find((r) => r.connectorId === "broken");
    expect(brokenRun?.status).toBe(ConnectorRunStatus.FAILED);
    expect(brokenRun?.error?.code).toBe("CONNECTOR_EXECUTION_ERROR");

    expect(metrics.snapshot().connectors["broken"]?.successRate).toBe(0);
    expect(metrics.snapshot().connectors["healthy"]?.successRate).toBe(1);
  });

  it("returns FAILED when every connector fails, without throwing", async () => {
    const { service } = createService([
      new StubConnector({ id: "f1", failTimes: Number.POSITIVE_INFINITY }),
      new StubConnector({ id: "f2", failTimes: Number.POSITIVE_INFINITY }),
    ]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.claimables).toEqual([]);
    expect(report.connectorRuns).toHaveLength(2);
  });

  it("excludes connectors whose supports() throws and still scans the rest", async () => {
    const hostile = new StubConnector({ id: "hostile" });
    hostile.supports = () => {
      throw new Error("supports() exploded");
    };
    const { service } = createService([hostile, new MockConnector()]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.connectorRuns.map((r) => r.connectorId)).toEqual(["mock"]);
  });
});

describe("ScanService — cancellation", () => {
  it("cancels in-flight connectors and reports them CANCELLED", async () => {
    const slow1 = new StubConnector({ id: "slow-1", delayMs: 300 });
    const slow2 = new StubConnector({ id: "slow-2", delayMs: 300 });
    const { service } = createService([slow1, slow2]);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const started = performance.now();
    const report = await service.scan(testRequest, { signal: controller.signal });

    expect(performance.now() - started).toBeLessThan(250);
    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns.map((r) => r.status)).toEqual([
      ConnectorRunStatus.CANCELLED,
      ConnectorRunStatus.CANCELLED,
    ]);
  });

  it("enforces the whole-scan deadline as cancellation", async () => {
    const glacial = new StubConnector({ id: "glacial", delayMs: 500 });
    const { service } = createService([glacial], {
      scanDeadlineMs: 30,
      timeoutMs: 5_000,
    });

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns[0]?.status).toBe(ConnectorRunStatus.CANCELLED);
    expect(report.durationMs).toBeLessThan(300);
  });
});

describe("ScanService — merging, dedup, ordering", () => {
  const claimA = (over: Partial<Claimable> = {}) =>
    makeClaimable({ id: "dup:1", usdValue: 100, ...over });

  it("deduplicates claimables with the same id across connectors", async () => {
    const one = new StubConnector({ id: "src-a", claimables: [claimA({ connectorId: "src-a" })] });
    const two = new StubConnector({ id: "src-b", claimables: [claimA({ connectorId: "src-b" })] });
    const { service } = createService([one, two]);

    const report = await service.scan(testRequest);

    expect(report.claimables).toHaveLength(1);
    // Deterministic winner: sorted before dedup, tie broken by connectorId.
    expect(report.claimables[0]?.connectorId).toBe("src-a");
  });

  it("deduplicates repeated ids within a single connector response", async () => {
    const stub = new StubConnector({
      id: "echo",
      claimables: [claimA({ connectorId: "echo" }), claimA({ connectorId: "echo" })],
    });
    const { service } = createService([stub]);

    const report = await service.scan(testRequest);
    expect(report.claimables).toHaveLength(1);
  });

  it("orders results deterministically regardless of connector completion order", async () => {
    // The slower connector carries the higher-value claimable, so completion
    // order (fast-first) differs from rank order (value-first).
    const fastLow = new StubConnector({
      id: "fast-low",
      delayMs: 1,
      claimables: [
        makeClaimable({ id: "low", connectorId: "fast-low", usdValue: 5 }),
        makeClaimable({ id: "unpriced", connectorId: "fast-low", usdValue: null }),
      ],
    });
    const slowHigh = new StubConnector({
      id: "slow-high",
      delayMs: 40,
      claimables: [makeClaimable({ id: "high", connectorId: "slow-high", usdValue: 900 })],
    });

    const run = async () => {
      const { service } = createService([fastLow, slowHigh]);
      const report = await service.scan(testRequest);
      return report.claimables.map((c) => c.id);
    };

    const first = await run();
    const second = await run();

    expect(first).toEqual(["high", "low", "unpriced"]);
    expect(second).toEqual(first);
  });
});

describe("ScanService — normalization boundary", () => {
  it("drops malformed claimables, keeps valid ones, and records the drop", async () => {
    const sloppy = new StubConnector({
      id: "sloppy",
      claimables: [
        makeClaimable({ id: "valid", connectorId: "sloppy" }),
        { id: "not-a-claimable", amountRaw: "12.5" },
      ],
    });
    const { service, metrics } = createService([sloppy]);

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.claimables.map((c) => c.id)).toEqual(["valid"]);
    expect(report.connectorRuns[0]?.itemsFound).toBe(1);
    expect(metrics.snapshot().connectors["sloppy"]?.droppedClaimables).toBe(1);
  });

  it("stamps connectorId from metadata so provenance cannot be spoofed", async () => {
    const liar = new StubConnector({
      id: "honest-id",
      claimables: [makeClaimable({ id: "x", connectorId: "someone-else" })],
    });
    const { service } = createService([liar]);

    const report = await service.scan(testRequest);
    expect(report.claimables[0]?.connectorId).toBe("honest-id");
  });
});

describe("ScanService — retries through the pipeline", () => {
  it("recovers a flaky connector via retry and reports attempts + retry metrics", async () => {
    const flaky = new StubConnector({
      id: "flaky",
      failTimes: 1,
      claimables: [makeClaimable({ id: "flaky:1", connectorId: "flaky" })],
    });
    const { service, metrics } = createService([flaky], { maxRetries: 2 });

    const report = await service.scan(testRequest);

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.connectorRuns[0]?.attempts).toBe(2);
    expect(metrics.snapshot().connectors["flaky"]?.retries).toBe(1);
  });
});
