import type { Connector, ConnectorContext, ConnectorRegistry } from "@/connectors";
import { createCache, type CacheStore } from "@/lib/cache";
import { createDefaultChainAccess, type ChainAccess } from "@/lib/chain";
import { ValidationError } from "@/lib/errors";
import { createLogger, type Logger } from "@/lib/logger";
import {
  ConnectorRunStatus,
  ScanStatus,
  type Claimable,
  type ConnectorRunSummary,
  type ScanReport,
  type ScanRequest,
} from "@/types";

import { mapWithConcurrency } from "./concurrency";
import {
  ConnectorRuntime,
  type ConnectorRunResult,
  type ConnectorRuntimeOptions,
} from "./connector-runtime";
import { ScanMetrics, scanMetrics } from "./metrics";
import { mergeClaimables, normalizeScanResponse } from "./normalize";

/**
 * ScanService — the scan pipeline orchestrator.
 *
 *   receive request → select connectors → execute concurrently (runtime)
 *   → normalize → merge → sort → report
 *
 * The service knows nothing about blockchains or protocols: it speaks only
 * the Connector SDK (`ScanRequest` in, `Claimable` out). All collaborators
 * are injected so the pipeline is fully testable without Redis, a database,
 * or any real connector.
 */

export interface ScanServiceDeps {
  registry: ConnectorRegistry;
  runtime?: ConnectorRuntime;
  metrics?: ScanMetrics;
  logger?: Logger;
  /** Builds the namespaced cache handed to each connector. */
  cacheFactory?: (namespace: string) => CacheStore;
  /** Chain Access Layer handed to connectors via ctx.chain. */
  chainAccess?: ChainAccess;
  /** Injected clock, forwarded to connectors via ctx.now. */
  clock?: () => Date;
  /** Per-connector configuration, keyed by connector id. */
  connectorConfig?: Record<string, Readonly<Record<string, string>>>;
}

export interface ScanServiceOptions extends Partial<ConnectorRuntimeOptions> {
  /** Max connectors executing at once. */
  concurrency: number;
  /** Whole-scan deadline; runs still in flight when it fires are cancelled. */
  scanDeadlineMs: number;
}

export const DEFAULT_SCAN_OPTIONS: ScanServiceOptions = {
  concurrency: 5,
  scanDeadlineMs: 30_000,
};

export class ScanService {
  private readonly registry: ConnectorRegistry;
  private readonly runtime: ConnectorRuntime;
  private readonly metrics: ScanMetrics;
  private readonly logger: Logger;
  private readonly cacheFactory: (namespace: string) => CacheStore;
  // Lazy: only resolved when a connector actually calls ctx.chain, so tests
  // and chainless scans never touch env-driven client construction.
  private chainAccess?: ChainAccess;
  private readonly clock: () => Date;
  private readonly connectorConfig: Record<string, Readonly<Record<string, string>>>;
  private readonly options: ScanServiceOptions;

  constructor(deps: ScanServiceDeps, options: Partial<ScanServiceOptions> = {}) {
    this.registry = deps.registry;
    this.runtime = deps.runtime ?? new ConnectorRuntime(options);
    this.metrics = deps.metrics ?? scanMetrics;
    this.logger = deps.logger ?? createLogger({ module: "scan-service" });
    this.cacheFactory = deps.cacheFactory ?? createCache;
    this.chainAccess = deps.chainAccess;
    this.clock = deps.clock ?? (() => new Date());
    this.connectorConfig = deps.connectorConfig ?? {};
    this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
  }

  /**
   * Run one scan. Resolves with a report even when connectors fail — only a
   * malformed request (or a bug) rejects.
   */
  async scan(request: ScanRequest, opts: { signal?: AbortSignal } = {}): Promise<ScanReport> {
    const address = request.address?.trim();
    if (!address) {
      throw new ValidationError("address is required");
    }
    const normalizedRequest: ScanRequest = { ...request, address };

    const scanId = crypto.randomUUID();
    const startedAt = this.clock();
    const t0 = performance.now();
    const log = this.logger.child({ scanId, address });

    // Selection: connectors whose supports() passes; a throwing supports()
    // excludes that connector only.
    const connectors = this.registry.forRequest(normalizedRequest, {
      onError: (connector, error) =>
        log.warn(
          { connectorId: connector.metadata.id, err: error },
          "connector supports() threw; excluding from scan",
        ),
    });
    log.info({ connectors: connectors.map((c) => c.metadata.id) }, "scan started");

    // Whole-scan deadline combined with caller cancellation.
    const deadline = AbortSignal.timeout(this.options.scanDeadlineMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;

    const runs = await mapWithConcurrency(connectors, this.options.concurrency, (connector) =>
      this.runtime.execute(connector, normalizedRequest, this.createContext(connector, log), {
        signal,
        ...runtimeOverrides(this.options),
      }),
    );

    const { claimables, summaries } = this.collect(runs, log);
    const status = aggregateStatus(runs);
    const durationMs = Math.round(performance.now() - t0);
    this.metrics.recordScan(status, durationMs, claimables.length);

    log.info(
      { status, durationMs, claimables: claimables.length, connectors: summaries.length },
      "scan completed",
    );

    return {
      scanId,
      address,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: this.clock().toISOString(),
      durationMs,
      claimables,
      connectorRuns: summaries,
    };
  }

  /** Normalize successful runs, record metrics, and reduce runs to summaries. */
  private collect(
    runs: ConnectorRunResult[],
    log: Logger,
  ): { claimables: Claimable[]; summaries: ConnectorRunSummary[] } {
    const collected: Claimable[] = [];
    const summaries: ConnectorRunSummary[] = [];

    for (const run of runs) {
      const connectorId = run.connector.metadata.id;
      let itemsFound = 0;

      if (run.status === ConnectorRunStatus.SUCCESS && run.response) {
        const { claimables, dropped } = normalizeScanResponse(run.connector, run.response, log);
        collected.push(...claimables);
        itemsFound = claimables.length;
        if (dropped > 0) {
          this.metrics.recordDroppedClaimables(connectorId, dropped);
        }
      }

      this.metrics.recordConnectorRun(connectorId, run.status, run.durationMs, run.attempts);
      summaries.push({
        connectorId,
        status: run.status,
        attempts: run.attempts,
        durationMs: run.durationMs,
        itemsFound,
        ...(run.error ? { error: { code: run.error.code, message: run.error.message } } : {}),
      });
    }

    return { claimables: mergeClaimables(collected), summaries };
  }

  private createContext(connector: Connector, log: Logger): Omit<ConnectorContext, "signal"> {
    const { id, version } = connector.metadata;
    return {
      logger: log.child({ connectorId: id }),
      // Version-keyed namespace: bumping a connector's version invalidates
      // its cache (blueprint §13).
      cache: this.cacheFactory(`connector:${id}:${version}`),
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
 * PARTIAL: at least one succeeded, at least one didn't.
 * FAILED: connectors ran, none succeeded.
 */
function aggregateStatus(runs: ConnectorRunResult[]): ScanStatus {
  if (runs.length === 0) return ScanStatus.COMPLETE;
  const successes = runs.filter((r) => r.status === ConnectorRunStatus.SUCCESS).length;
  if (successes === runs.length) return ScanStatus.COMPLETE;
  if (successes > 0) return ScanStatus.PARTIAL;
  return ScanStatus.FAILED;
}

function runtimeOverrides(options: ScanServiceOptions): Partial<ConnectorRuntimeOptions> {
  const { timeoutMs, maxRetries, backoffBaseMs, maxBackoffMs } = options;
  return {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
    ...(backoffBaseMs !== undefined ? { backoffBaseMs } : {}),
    ...(maxBackoffMs !== undefined ? { maxBackoffMs } : {}),
  };
}
