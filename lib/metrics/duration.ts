/**
 * Shared duration-statistics primitive.
 *
 * Both the Scan Engine (lib/scan/metrics) and the Discovery Engine
 * (lib/discovery/metrics) aggregate operation durations the same way; this is
 * the single implementation they share so the two metric systems stay
 * consistent and neither reinvents min/max/avg accounting.
 */

export interface DurationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

export class DurationAccumulator {
  private count = 0;
  private totalMs = 0;
  private minMs = Number.POSITIVE_INFINITY;
  private maxMs = 0;

  observe(ms: number): void {
    this.count++;
    this.totalMs += ms;
    this.minMs = Math.min(this.minMs, ms);
    this.maxMs = Math.max(this.maxMs, ms);
  }

  snapshot(): DurationStats {
    return {
      count: this.count,
      totalMs: Math.round(this.totalMs),
      minMs: this.count === 0 ? 0 : Math.round(this.minMs),
      maxMs: Math.round(this.maxMs),
      avgMs: this.count === 0 ? 0 : Math.round(this.totalMs / this.count),
    };
  }

  reset(): void {
    this.count = 0;
    this.totalMs = 0;
    this.minMs = Number.POSITIVE_INFINITY;
    this.maxMs = 0;
  }
}
