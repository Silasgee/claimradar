import { ConnectorRunStatus, ScanStatus } from "@/types";

/**
 * In-process scan metrics.
 *
 * Deliberately minimal for this milestone: counters and duration aggregates
 * held in memory, exposed as a JSON snapshot on the internal metrics endpoint.
 * When the blueprint's observability stack lands (Prometheus/OTel), this
 * registry becomes the adapter — callers already record through one seam.
 *
 * Not persisted and per-process by design; these are operational metrics,
 * not analytics.
 */

export interface DurationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

interface DurationAccumulator {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

interface ConnectorStats {
  runs: number;
  byStatus: Record<ConnectorRunStatus, number>;
  retries: number;
  droppedClaimables: number;
  duration: DurationAccumulator;
}

export interface MetricsSnapshot {
  scans: {
    total: number;
    byStatus: Record<ScanStatus, number>;
    claimablesFound: number;
    duration: DurationStats;
  };
  connectors: Record<
    string,
    {
      runs: number;
      byStatus: Record<ConnectorRunStatus, number>;
      /** successes / runs, in [0, 1]. 1 when the connector has never run. */
      successRate: number;
      retries: number;
      droppedClaimables: number;
      duration: DurationStats;
    }
  >;
}

const emptyDuration = (): DurationAccumulator => ({
  count: 0,
  totalMs: 0,
  minMs: Number.POSITIVE_INFINITY,
  maxMs: 0,
});

const emptyRunStatuses = (): Record<ConnectorRunStatus, number> => ({
  [ConnectorRunStatus.SUCCESS]: 0,
  [ConnectorRunStatus.FAILED]: 0,
  [ConnectorRunStatus.TIMEOUT]: 0,
  [ConnectorRunStatus.CANCELLED]: 0,
});

const emptyScanStatuses = (): Record<ScanStatus, number> => ({
  [ScanStatus.QUEUED]: 0,
  [ScanStatus.RUNNING]: 0,
  [ScanStatus.PARTIAL]: 0,
  [ScanStatus.COMPLETE]: 0,
  [ScanStatus.FAILED]: 0,
});

function observe(acc: DurationAccumulator, ms: number): void {
  acc.count++;
  acc.totalMs += ms;
  acc.minMs = Math.min(acc.minMs, ms);
  acc.maxMs = Math.max(acc.maxMs, ms);
}

function finalize(acc: DurationAccumulator): DurationStats {
  return {
    count: acc.count,
    totalMs: Math.round(acc.totalMs),
    minMs: acc.count === 0 ? 0 : Math.round(acc.minMs),
    maxMs: Math.round(acc.maxMs),
    avgMs: acc.count === 0 ? 0 : Math.round(acc.totalMs / acc.count),
  };
}

export class ScanMetrics {
  private scanTotal = 0;
  private scanByStatus = emptyScanStatuses();
  private claimablesFound = 0;
  private scanDuration = emptyDuration();
  private connectors = new Map<string, ConnectorStats>();

  recordScan(status: ScanStatus, durationMs: number, claimablesFound: number): void {
    this.scanTotal++;
    this.scanByStatus[status]++;
    this.claimablesFound += claimablesFound;
    observe(this.scanDuration, durationMs);
  }

  recordConnectorRun(
    connectorId: string,
    status: ConnectorRunStatus,
    durationMs: number,
    attempts: number,
  ): void {
    const stats = this.connectorStats(connectorId);
    stats.runs++;
    stats.byStatus[status]++;
    stats.retries += Math.max(0, attempts - 1);
    observe(stats.duration, durationMs);
  }

  recordDroppedClaimables(connectorId: string, count: number): void {
    this.connectorStats(connectorId).droppedClaimables += count;
  }

  snapshot(): MetricsSnapshot {
    const connectors: MetricsSnapshot["connectors"] = {};
    for (const [id, stats] of this.connectors) {
      connectors[id] = {
        runs: stats.runs,
        byStatus: { ...stats.byStatus },
        successRate: stats.runs === 0 ? 1 : stats.byStatus[ConnectorRunStatus.SUCCESS] / stats.runs,
        retries: stats.retries,
        droppedClaimables: stats.droppedClaimables,
        duration: finalize(stats.duration),
      };
    }
    return {
      scans: {
        total: this.scanTotal,
        byStatus: { ...this.scanByStatus },
        claimablesFound: this.claimablesFound,
        duration: finalize(this.scanDuration),
      },
      connectors,
    };
  }

  reset(): void {
    this.scanTotal = 0;
    this.scanByStatus = emptyScanStatuses();
    this.claimablesFound = 0;
    this.scanDuration = emptyDuration();
    this.connectors.clear();
  }

  private connectorStats(connectorId: string): ConnectorStats {
    let stats = this.connectors.get(connectorId);
    if (!stats) {
      stats = {
        runs: 0,
        byStatus: emptyRunStatuses(),
        retries: 0,
        droppedClaimables: 0,
        duration: emptyDuration(),
      };
      this.connectors.set(connectorId, stats);
    }
    return stats;
  }
}

/** Process-wide default registry (the internal metrics endpoint reads this). */
export const scanMetrics = new ScanMetrics();
