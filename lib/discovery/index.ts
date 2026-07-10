/**
 * Discovery Engine public surface.
 *
 * Application code should import from "@/lib/discovery" — never from the
 * engine's internal files.
 */
export type {
  ConnectorCapabilities,
  DiscoveryConnector,
  DiscoveryConnectorMetadata,
  DiscoveryContext,
  HealthStatus,
} from "./connector";
export { CLAIM_ID_VERSION, computeClaimId } from "./claim-id";
export type { ClaimIdentity } from "./claim-id";
export { GLOBAL_TRUSTED_DOMAINS, validateClaimUrl } from "./claim-url";
export type { ClaimUrlValidation } from "./claim-url";
export { dedupeClaims, normalizeDiscoveryResult } from "./claim-normalizer";
export type { NormalizedClaims } from "./claim-normalizer";
export { computeRankScore, rankClaims, CONFIDENCE_SCORE, STATUS_SCORE } from "./ranking";
export type { RankingOptions } from "./ranking";
export { DiscoveryMetrics, discoveryMetrics } from "./metrics";
export type { DiscoveryMetricsSnapshot } from "./metrics";
export { DiscoveryConnectorRegistry } from "./registry";
export { DEFAULT_DISCOVERY_OPTIONS, DiscoveryEngine } from "./discovery-engine";
export type { DiscoveryEngineDeps, DiscoveryEngineOptions } from "./discovery-engine";

import { createDefaultDiscoveryRegistry } from "@/connectors/discovery";

import { DiscoveryEngine } from "./discovery-engine";

/**
 * Build a DiscoveryEngine wired with production defaults: the default discovery
 * registry, the shared metrics registry, and the Redis-backed cache.
 */
export function createDiscoveryEngine(): DiscoveryEngine {
  return new DiscoveryEngine({ registry: createDefaultDiscoveryRegistry() });
}
