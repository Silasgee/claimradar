import { DurationAccumulator, type DurationStats } from "@/lib/metrics/duration";
import { ConnectorRunStatus, ScanStatus, type RankedClaim } from "@/types";

/**
 * In-process discovery metrics (Milestone 3, Phase 7).
 *
 * Separate from `ScanMetrics` (the two engines are distinct) but built on the
 * same `DurationAccumulator` primitive. Exposed alongside scan metrics on the
 * internal metrics endpoint. Per-process, not persisted — operational, not
 * analytics.
 */

interface ConnectorStats {
  runs: number;
  byStatus: Record<ConnectorRunStatus, number>;
  failures: number;
  droppedClaims: number;
  claimsFound: number;
  duration: DurationAccumulator;
}

export interface DiscoveryMetricsSnapshot {
  discoveries: {
    total: number;
    byStatus: Record<ScanStatus, number>;
    successfulDiscoveries: number;
    claimsFound: number;
    duplicatesRemoved: number;
    duration: DurationStats;
    rankingDuration: DurationStats;
  };
  connectors: Record<
    string,
    {
      runs: number;
      byStatus: Record<ConnectorRunStatus, number>;
      successRate: number;
      failures: number;
      droppedClaims: number;
      claimsFound: number;
      duration: DurationStats;
    }
  >;
  claimsByCategory: Record<string, number>;
  claimsByProtocol: Record<string, number>;
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

export class DiscoveryMetrics {
  private discoveryTotal = 0;
  private discoveryByStatus = emptyScanStatuses();
  private successfulDiscoveries = 0;
  private claimsFound = 0;
  private duplicatesRemoved = 0;
  private discoveryDuration = new DurationAccumulator();
  private rankingDuration = new DurationAccumulator();
  private connectors = new Map<string, ConnectorStats>();
  private claimsByCategory = new Map<string, number>();
  private claimsByProtocol = new Map<string, number>();

  recordDiscovery(
    status: ScanStatus,
    durationMs: number,
    claimsFound: number,
    duplicatesRemoved: number,
  ): void {
    this.discoveryTotal++;
    this.discoveryByStatus[status]++;
    if (status === ScanStatus.COMPLETE || status === ScanStatus.PARTIAL) {
      this.successfulDiscoveries++;
    }
    this.claimsFound += claimsFound;
    this.duplicatesRemoved += duplicatesRemoved;
    this.discoveryDuration.observe(durationMs);
  }

  recordRanking(durationMs: number): void {
    this.rankingDuration.observe(durationMs);
  }

  recordConnectorRun(
    connectorId: string,
    status: ConnectorRunStatus,
    durationMs: number,
    claimsFound: number,
  ): void {
    const stats = this.connectorStats(connectorId);
    stats.runs++;
    stats.byStatus[status]++;
    if (status !== ConnectorRunStatus.SUCCESS) stats.failures++;
    stats.claimsFound += claimsFound;
    stats.duration.observe(durationMs);
  }

  recordDroppedClaims(connectorId: string, count: number): void {
    this.connectorStats(connectorId).droppedClaims += count;
  }

  /** Record the final, ranked claims for category/protocol breakdowns. */
  recordClaims(claims: RankedClaim[]): void {
    for (const claim of claims) {
      this.claimsByCategory.set(
        claim.category,
        (this.claimsByCategory.get(claim.category) ?? 0) + 1,
      );
      this.claimsByProtocol.set(
        claim.protocol.id,
        (this.claimsByProtocol.get(claim.protocol.id) ?? 0) + 1,
      );
    }
  }

  snapshot(): DiscoveryMetricsSnapshot {
    const connectors: DiscoveryMetricsSnapshot["connectors"] = {};
    for (const [id, stats] of this.connectors) {
      connectors[id] = {
        runs: stats.runs,
        byStatus: { ...stats.byStatus },
        successRate: stats.runs === 0 ? 1 : stats.byStatus[ConnectorRunStatus.SUCCESS] / stats.runs,
        failures: stats.failures,
        droppedClaims: stats.droppedClaims,
        claimsFound: stats.claimsFound,
        duration: stats.duration.snapshot(),
      };
    }
    return {
      discoveries: {
        total: this.discoveryTotal,
        byStatus: { ...this.discoveryByStatus },
        successfulDiscoveries: this.successfulDiscoveries,
        claimsFound: this.claimsFound,
        duplicatesRemoved: this.duplicatesRemoved,
        duration: this.discoveryDuration.snapshot(),
        rankingDuration: this.rankingDuration.snapshot(),
      },
      connectors,
      claimsByCategory: Object.fromEntries(this.claimsByCategory),
      claimsByProtocol: Object.fromEntries(this.claimsByProtocol),
    };
  }

  reset(): void {
    this.discoveryTotal = 0;
    this.discoveryByStatus = emptyScanStatuses();
    this.successfulDiscoveries = 0;
    this.claimsFound = 0;
    this.duplicatesRemoved = 0;
    this.discoveryDuration.reset();
    this.rankingDuration.reset();
    this.connectors.clear();
    this.claimsByCategory.clear();
    this.claimsByProtocol.clear();
  }

  private connectorStats(connectorId: string): ConnectorStats {
    let stats = this.connectors.get(connectorId);
    if (!stats) {
      stats = {
        runs: 0,
        byStatus: emptyRunStatuses(),
        failures: 0,
        droppedClaims: 0,
        claimsFound: 0,
        duration: new DurationAccumulator(),
      };
      this.connectors.set(connectorId, stats);
    }
    return stats;
  }
}

/** Process-wide default registry (the internal metrics endpoint reads this). */
export const discoveryMetrics = new DiscoveryMetrics();
