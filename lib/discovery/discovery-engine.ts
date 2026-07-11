import { createCache, type CacheStore } from "@/lib/cache";
import { createDefaultChainAccess, type ChainAccess } from "@/lib/chain";
import { ValidationError } from "@/lib/errors";
import { createLogger, type Logger } from "@/lib/logger";
import {
  ConnectorRuntime,
  mapWithConcurrency,
  type ConnectorRuntimeOptions,
  type RunOptions,
} from "@/lib/scan";
import {
  ConnectorRunStatus,
  ScanStatus,
  type Claim,
  type DiscoveryConnectorRunSummary,
  type DiscoveryReport,
  type DiscoveryRequest,
  type DiscoveryResult,
  type RankedClaim,
} from "@/types";

import { dedupeClaims, normalizeDiscoveryResult } from "./claim-normalizer";
import type { DiscoveryConnector, DiscoveryContext } from "./connector";
import { DiscoveryMetrics, discoveryMetrics } from "./metrics";
import type { DiscoveryConnectorRegistry } from "./registry";
import { rankClaims } from "./ranking";

/**
 * Discovery Engine (Milestone 3, Phase 3) — the heart of AssetRadar.
 *
 * Sits ABOVE the Scan Engine. It accepts a wallet, executes discovery
 * connectors in isolation (reusing the Scan Engine's ConnectorRuntime),
 * normalizes their output into canonical claims, merges + dedupes them, ranks
 * them deterministically, and produces a stable report.
 *
 *   accept wallet → select connectors → execute concurrently (isolated)
 *   → normalize → merge → dedupe → rank → deterministic report
 *
 * It knows NOTHING about blockchains or RPC providers: it speaks only the
 * canonical `Claim` model. All collaborators are injected, so it is fully
 * testable without Redis, a database, or a live chain.
 */

export interface DiscoveryEngineDeps {
  registry: DiscoveryConnectorRegistry;
  runtime?: ConnectorRuntime;
  metrics?: DiscoveryMetrics;
  logger?: Logger;
  cacheFactory?: (namespace: string) => CacheStore;
  chainAccess?: ChainAccess;
  clock?: () => Date;
  connectorConfig?: Record<string, Readonly<Record<string, string>>>;
}

export interface DiscoveryEngineOptions extends Partial<ConnectorRuntimeOptions> {
  /** Max connectors executing at once. */
  concurrency: number;
  /** Whole-discovery deadline; runs still in flight when it fires are cancelled. */
  discoveryDeadlineMs: number;
}

export const DEFAULT_DISCOVERY_OPTIONS: DiscoveryEngineOptions = {
  concurrency: 5,
  discoveryDeadlineMs: 30_000,
};

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class DiscoveryEngine {
  private readonly registry: DiscoveryConnectorRegistry;
  private readonly runtime: ConnectorRuntime;
  private readonly metrics: DiscoveryMetrics;
  private readonly logger: Logger;
  private readonly cacheFactory: (namespace: string) => CacheStore;
  private chainAccess?: ChainAccess;
  private readonly clock: () => Date;
  private readonly connectorConfig: Record<string, Readonly<Record<string, string>>>;
  private readonly options: DiscoveryEngineOptions;

  constructor(deps: DiscoveryEngineDeps, options: Partial<DiscoveryEngineOptions> = {}) {
    this.registry = deps.registry;
    this.runtime = deps.runtime ?? new ConnectorRuntime(options);
    this.metrics = deps.metrics ?? discoveryMetrics;
    this.logger = deps.logger ?? createLogger({ module: "discovery-engine" });
    this.cacheFactory = deps.cacheFactory ?? createCache;
    this.chainAccess = deps.chainAccess;
    this.clock = deps.clock ?? (() => new Date());
    this.connectorConfig = deps.connectorConfig ?? {};
    this.options = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  }

  /**
   * Discover claims for one wallet. Resolves with a report even when connectors
   * fail — only a malformed request (or a bug) rejects.
   */
  async discover(
    request: DiscoveryRequest,
    opts: { signal?: AbortSignal } = {},
  ): Promise<DiscoveryReport> {
    const wallet = request.wallet?.trim();
    if (!wallet) throw new ValidationError("wallet is required");
    if (!EVM_ADDRESS.test(wallet)) {
      throw new ValidationError("wallet must be a 0x-prefixed 20-byte hex address");
    }
    const canonicalWallet = wallet.toLowerCase();
    const normalizedRequest: DiscoveryRequest = { ...request, wallet: canonicalWallet };

    const discoveryId = crypto.randomUUID();
    const startedAt = this.clock();
    const t0 = performance.now();
    const log = this.logger.child({ discoveryId, wallet: canonicalWallet });

    const connectors = this.registry.forRequest(normalizedRequest, {
      onError: (connector, error) =>
        log.warn(
          { connectorId: connector.metadata.id, err: error },
          "discovery connector supportedChains() threw; excluding",
        ),
    });
    log.info({ connectors: connectors.map((c) => c.metadata.id) }, "discovery started");

    const deadline = AbortSignal.timeout(this.options.discoveryDeadlineMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    const runOpts: RunOptions = { signal, ...runtimeOverrides(this.options) };

    const runs = await mapWithConcurrency(
      connectors,
      this.options.concurrency,
      async (connector) => {
        const ctx = this.createContext(connector, log);
        const result = await this.runtime.runIsolated<DiscoveryResult>(
          connector.metadata.id,
          (sig) => connector.discover({ ...ctx, signal: sig }, normalizedRequest),
          log,
          runOpts,
        );
        return { connector, result };
      },
    );

    const { claims, summaries, dropped } = this.collect(runs, canonicalWallet, log);

    // Merge → dedupe → rank.
    const { claims: deduped, duplicatesRemoved } = dedupeClaims(claims);
    const rankStart = performance.now();
    const ranked: RankedClaim[] = rankClaims(deduped, { now: this.clock });
    const rankingDurationMs = Math.round(performance.now() - rankStart);
    this.metrics.recordRanking(rankingDurationMs);
    this.metrics.recordClaims(ranked);

    const status = aggregateStatus(runs.map((r) => r.result.status));
    const durationMs = Math.round(performance.now() - t0);
    this.metrics.recordDiscovery(status, durationMs, ranked.length, duplicatesRemoved);

    log.info(
      { status, durationMs, claims: ranked.length, duplicatesRemoved, dropped },
      "discovery completed",
    );

    return {
      discoveryId,
      wallet: canonicalWallet,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: this.clock().toISOString(),
      durationMs,
      claims: ranked,
      connectorRuns: summaries,
      stats: {
        discovered: claims.length,
        duplicatesRemoved,
        dropped,
        rankingDurationMs,
      },
    };
  }

  /** Normalize successful runs, record metrics, reduce runs to summaries. */
  private collect(
    runs: Array<{
      connector: DiscoveryConnector;
      result: Awaited<ReturnType<ConnectorRuntime["runIsolated"]>>;
    }>,
    wallet: string,
    log: Logger,
  ): { claims: Claim[]; summaries: DiscoveryConnectorRunSummary[]; dropped: number } {
    const collected: Claim[] = [];
    const summaries: DiscoveryConnectorRunSummary[] = [];
    let dropped = 0;

    for (const { connector, result } of runs) {
      const connectorId = connector.metadata.id;
      let claimsFound = 0;

      if (result.status === ConnectorRunStatus.SUCCESS && result.value) {
        const normalized = normalizeDiscoveryResult(
          connector,
          result.value as DiscoveryResult,
          wallet,
          log,
        );
        collected.push(...normalized.claims);
        claimsFound = normalized.claims.length;
        if (normalized.dropped > 0) {
          dropped += normalized.dropped;
          this.metrics.recordDroppedClaims(connectorId, normalized.dropped);
        }
      }

      this.metrics.recordConnectorRun(connectorId, result.status, result.durationMs, claimsFound);
      summaries.push({
        connectorId,
        protocolId: connector.metadata.protocol.id,
        status: result.status,
        attempts: result.attempts,
        durationMs: result.durationMs,
        claimsFound,
        ...(result.error
          ? { error: { code: result.error.code, message: result.error.message } }
          : {}),
      });
    }

    return { claims: collected, summaries, dropped };
  }

  private createContext(
    connector: DiscoveryConnector,
    log: Logger,
  ): Omit<DiscoveryContext, "signal"> {
    const { id } = connector.metadata;
    return {
      logger: log.child({ connectorId: id }),
      // Version-keyed namespace: bumping a connector's version invalidates its
      // cache (blueprint §13).
      cache: this.cacheFactory(`discovery:${id}:${connector.version}`),
      config: this.connectorConfig[id] ?? {},
      now: this.clock,
      chain: (chain) => {
        this.chainAccess ??= createDefaultChainAccess();
        return this.chainAccess.getClient(chain);
      },
    };
  }
}

/**
 * COMPLETE: every applicable connector succeeded (vacuously true for zero).
 * PARTIAL: at least one succeeded, at least one did not.
 * FAILED: connectors ran; none succeeded.
 */
function aggregateStatus(statuses: ConnectorRunStatus[]): ScanStatus {
  if (statuses.length === 0) return ScanStatus.COMPLETE;
  const successes = statuses.filter((s) => s === ConnectorRunStatus.SUCCESS).length;
  if (successes === statuses.length) return ScanStatus.COMPLETE;
  if (successes > 0) return ScanStatus.PARTIAL;
  return ScanStatus.FAILED;
}

function runtimeOverrides(options: DiscoveryEngineOptions): Partial<ConnectorRuntimeOptions> {
  const { timeoutMs, maxRetries, backoffBaseMs, maxBackoffMs } = options;
  return {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
    ...(backoffBaseMs !== undefined ? { backoffBaseMs } : {}),
    ...(maxBackoffMs !== undefined ? { maxBackoffMs } : {}),
  };
}
