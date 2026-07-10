import { DurationAccumulator, type DurationStats } from "@/lib/metrics/duration";
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

export type { DurationStats };

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

export class ScanMetrics {
  private scanTotal = 0;
  private scanByStatus = emptyScanStatuses();
  private claimablesFound = 0;
  private scanDuration = new DurationAccumulator();
  private connectors = new Map<string, ConnectorStats>();

  recordScan(status: ScanStatus, durationMs: number, claimablesFound: number): void {
    this.scanTotal++;
    this.scanByStatus[status]++;
    this.claimablesFound += claimablesFound;
    this.scanDuration.observe(durationMs);
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
    stats.duration.observe(durationMs);
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
        duration: stats.duration.snapshot(),
      };
    }
    return {
      scans: {
        total: this.scanTotal,
        byStatus: { ...this.scanByStatus },
        claimablesFound: this.claimablesFound,
        duration: this.scanDuration.snapshot(),
      },
      connectors,
    };
  }

  reset(): void {
    this.scanTotal = 0;
    this.scanByStatus = emptyScanStatuses();
    this.claimablesFound = 0;
    this.scanDuration.reset();
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
        duration: new DurationAccumulator(),
      };
      this.connectors.set(connectorId, stats);
    }
    return stats;
  }
}

/** Process-wide default registry (the internal metrics endpoint reads this). */
export const scanMetrics = new ScanMetrics();
