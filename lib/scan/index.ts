/**
 * Scan Engine public surface.
 *
 * Application code should import from "@/lib/scan" — never from the engine's
 * internal files.
 */
export { ConnectorRuntime, DEFAULT_RUNTIME_OPTIONS } from "./connector-runtime";
export type {
  ConnectorRunResult,
  ConnectorRuntimeOptions,
  IsolatedRunResult,
  RunOptions,
} from "./connector-runtime";
export { mapWithConcurrency } from "./concurrency";
export { ScanMetrics, scanMetrics } from "./metrics";
export type { MetricsSnapshot } from "./metrics";
export { compareClaimables, mergeClaimables, normalizeScanResponse } from "./normalize";
export { DEFAULT_SCAN_OPTIONS, ScanService } from "./scan-service";
export type { ScanServiceDeps, ScanServiceOptions } from "./scan-service";

import { createDefaultRegistry } from "@/connectors";

import { ScanService } from "./scan-service";

/**
 * Build a ScanService wired with production defaults: the default connector
 * registry, the shared metrics registry, and the Redis-backed cache.
 */
export function createScanService(): ScanService {
  return new ScanService({ registry: createDefaultRegistry() });
}
