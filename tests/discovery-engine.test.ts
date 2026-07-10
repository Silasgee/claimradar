import { describe, expect, it } from "vitest";

import { MerkleDistributorConnector } from "@/connectors/discovery";
import { SAMPLE_MERKLE_ROOT } from "@/connectors/discovery/merkle-distributor/eligibility";
import { ValidationError } from "@/lib/errors";
import {
  DiscoveryConnectorRegistry,
  DiscoveryEngine,
  DiscoveryMetrics,
  type DiscoveryConnector,
} from "@/lib/discovery";
import { InMemoryCacheStore } from "@/lib/cache";
import type { ChainAccess } from "@/lib/chain";
import { Chain, ClaimStatus, ConnectorRunStatus, ScanStatus } from "@/types";

import { StubDiscoveryConnector, makeClaim } from "./discovery-helpers";
import { createTestLogger } from "./helpers";
import { createMockMerkleClient, mockMerkleChainAccess } from "./merkle-rpc";

const WALLET = "0x000000000000000000000000000000000000beef";

function createEngine(
  connectors: DiscoveryConnector[],
  options: ConstructorParameters<typeof DiscoveryEngine>[1] = {},
  chainAccess?: ChainAccess,
) {
  const registry = new DiscoveryConnectorRegistry();
  for (const connector of connectors) registry.register(connector);
  const metrics = new DiscoveryMetrics();
  const engine = new DiscoveryEngine(
    {
      registry,
      metrics,
      logger: createTestLogger(),
      cacheFactory: () => new InMemoryCacheStore(),
      chainAccess,
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    },
    { backoffBaseMs: 1, maxBackoffMs: 2, ...options },
  );
  return { engine, metrics };
}

describe("DiscoveryEngine — successful discovery (real connector, mocked RPC)", () => {
  it("runs the full pipeline end-to-end and produces a ranked report with metrics", async () => {
    const chainAccess = mockMerkleChainAccess(
      createMockMerkleClient({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false, gas: 120_000n }),
    );
    const { engine, metrics } = createEngine([new MerkleDistributorConnector()], {}, chainAccess);

    const report = await engine.discover({ wallet: WALLET });

    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.wallet).toBe(WALLET);
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0]).toMatchObject({ rank: 1, status: ClaimStatus.CLAIMABLE });
    expect(report.connectorRuns[0]).toMatchObject({
      connectorId: "merkle-distributor",
      protocolId: "example-merkle",
      status: ConnectorRunStatus.SUCCESS,
      claimsFound: 1,
    });

    const snapshot = metrics.snapshot();
    expect(snapshot.discoveries.total).toBe(1);
    expect(snapshot.discoveries.claimsFound).toBe(1);
    expect(snapshot.discoveries.rankingDuration.count).toBe(1);
    expect(snapshot.claimsByCategory.AIRDROP).toBe(1);
    expect(snapshot.claimsByProtocol["example-merkle"]).toBe(1);
  });

  it("produces stable claim ids across rescans of the same wallet", async () => {
    const build = () =>
      createEngine(
        [new MerkleDistributorConnector()],
        {},
        mockMerkleChainAccess(
          createMockMerkleClient({ merkleRoot: SAMPLE_MERKLE_ROOT, claimed: false }),
        ),
      ).engine;

    const first = await build().discover({ wallet: WALLET });
    const second = await build().discover({ wallet: WALLET.toUpperCase().replace("0X", "0x") });

    expect(first.claims[0]?.id).toBe(second.claims[0]?.id);
  });

  it("returns COMPLETE with no claims when no connector supports the requested chain", async () => {
    const { engine } = createEngine([
      new StubDiscoveryConnector({ id: "eth-only", chains: [Chain.ETHEREUM] }),
    ]);
    const report = await engine.discover({ wallet: WALLET, chains: [Chain.SOLANA] });
    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.claims).toEqual([]);
  });
});

describe("DiscoveryEngine — request validation", () => {
  it("rejects blank and malformed wallets with ValidationError", async () => {
    const { engine } = createEngine([new StubDiscoveryConnector({ id: "s" })]);
    await expect(engine.discover({ wallet: "  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(engine.discover({ wallet: "not-an-address" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("DiscoveryEngine — normalization & security boundary", () => {
  it("drops malformed claims, keeps valid ones, and records the drop", async () => {
    const stub = new StubDiscoveryConnector({
      id: "sloppy",
      claims: [makeClaim({ claimType: "keep" }), { garbage: true }],
    });
    const { engine, metrics } = createEngine([stub]);

    const report = await engine.discover({ wallet: WALLET });
    expect(report.claims).toHaveLength(1);
    expect(report.stats.dropped).toBe(1);
    expect(metrics.snapshot().connectors["sloppy"]?.droppedClaims).toBe(1);
  });

  it("drops claims whose URL is not on the connector's trusted domains", async () => {
    const stub = new StubDiscoveryConnector({
      id: "phisher",
      claims: [makeClaim({ claimUrl: "https://evil.io/steal" })],
      trustedDomains: ["claims.example.org"],
    });
    const { engine } = createEngine([stub]);

    const report = await engine.discover({ wallet: WALLET });
    expect(report.claims).toEqual([]);
    expect(report.stats.dropped).toBe(1);
  });

  it("re-derives claim id and stamps provenance from connector metadata (anti-spoof)", async () => {
    const stub = new StubDiscoveryConnector({
      id: "liar",
      protocolId: "liar-protocol",
      claims: [makeClaim({ id: "attacker-chosen-id", provenance: makeClaim().provenance })],
    });
    const { engine } = createEngine([stub]);

    const report = await engine.discover({ wallet: WALLET });
    expect(report.claims[0]?.id).not.toBe("attacker-chosen-id");
    expect(report.claims[0]?.provenance.connectorId).toBe("liar");
  });
});

describe("DiscoveryEngine — merge, dedup, ordering", () => {
  it("deduplicates claims with the same identity across connectors, keeping the strongest", async () => {
    // Both connectors emit a claim with identical identity fields → same id.
    const identity = { claimType: "shared", protocol: { id: "p", name: "P", priority: 50 } };
    const claimable = new StubDiscoveryConnector({
      id: "src-a",
      claims: [makeClaim({ ...identity, status: ClaimStatus.CLAIMABLE })],
    });
    const claimed = new StubDiscoveryConnector({
      id: "src-b",
      claims: [makeClaim({ ...identity, status: ClaimStatus.ALREADY_CLAIMED })],
    });
    const { engine } = createEngine([claimable, claimed]);

    const report = await engine.discover({ wallet: WALLET });
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0]?.status).toBe(ClaimStatus.CLAIMABLE); // stronger wins
    expect(report.stats.duplicatesRemoved).toBe(1);
  });

  it("orders claims deterministically regardless of connector completion order", async () => {
    const fastLow = new StubDiscoveryConnector({
      id: "fast",
      delayMs: 1,
      claims: [makeClaim({ claimType: "low", status: ClaimStatus.ALREADY_CLAIMED })],
    });
    const slowHigh = new StubDiscoveryConnector({
      id: "slow",
      delayMs: 30,
      claims: [makeClaim({ claimType: "high", status: ClaimStatus.CLAIMABLE })],
    });

    const run = async () => {
      const { engine } = createEngine([fastLow, slowHigh]);
      const report = await engine.discover({ wallet: WALLET });
      return report.claims.map((c) => c.claimType);
    };
    const first = await run();
    expect(first).toEqual(["high", "low"]); // CLAIMABLE ranks above ALREADY_CLAIMED
    expect(await run()).toEqual(first);
  });
});

describe("DiscoveryEngine — failure isolation, retries, timeout, cancellation", () => {
  it("returns PARTIAL when some connectors fail, surfacing the survivors", async () => {
    const healthy = new StubDiscoveryConnector({ id: "healthy", claims: [makeClaim()] });
    const broken = new StubDiscoveryConnector({
      id: "broken",
      failTimes: Number.POSITIVE_INFINITY,
    });
    const { engine } = createEngine([healthy, broken]);

    const report = await engine.discover({ wallet: WALLET });
    expect(report.status).toBe(ScanStatus.PARTIAL);
    expect(report.claims).toHaveLength(1);
    expect(report.connectorRuns.find((r) => r.connectorId === "broken")?.status).toBe(
      ConnectorRunStatus.FAILED,
    );
  });

  it("returns FAILED when every connector fails, without throwing", async () => {
    const { engine } = createEngine([
      new StubDiscoveryConnector({ id: "f1", failTimes: Number.POSITIVE_INFINITY }),
      new StubDiscoveryConnector({ id: "f2", failTimes: Number.POSITIVE_INFINITY }),
    ]);
    const report = await engine.discover({ wallet: WALLET });
    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.claims).toEqual([]);
  });

  it("recovers a flaky connector via retry and reports the attempt count", async () => {
    const flaky = new StubDiscoveryConnector({ id: "flaky", failTimes: 1, claims: [makeClaim()] });
    const { engine } = createEngine([flaky], { maxRetries: 2 });

    const report = await engine.discover({ wallet: WALLET });
    expect(report.status).toBe(ScanStatus.COMPLETE);
    expect(report.connectorRuns[0]?.attempts).toBe(2);
  });

  it("times out a hung connector at the per-attempt deadline", async () => {
    const { engine } = createEngine([new StubDiscoveryConnector({ id: "hung", delayMs: 5_000 })], {
      timeoutMs: 30,
      maxRetries: 0,
    });
    const report = await engine.discover({ wallet: WALLET });
    expect(report.status).toBe(ScanStatus.FAILED);
    expect(report.connectorRuns[0]?.status).toBe(ConnectorRunStatus.TIMEOUT);
    expect(report.durationMs).toBeLessThan(500);
  });

  it("honors caller cancellation mid-discovery", async () => {
    const { engine } = createEngine(
      [new StubDiscoveryConnector({ id: "slow", delayMs: 300, honorSignal: true })],
      { timeoutMs: 5_000 },
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const report = await engine.discover({ wallet: WALLET }, { signal: controller.signal });
    expect(report.connectorRuns[0]?.status).toBe(ConnectorRunStatus.CANCELLED);
  });
});
