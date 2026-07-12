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
import { getEnv } from "@/config/env";

import { DiscoveryEngine } from "./discovery-engine";

/**
 * Per-connector configuration, built from validated env. This is the single
 * place environment values become connector `ctx.config` — so connectors never
 * read `process.env` and no address/endpoint is hardcoded in connector code.
 * Only keys with a value are included; an unconfigured connector sees `{}` and
 * stays inert.
 */
function buildConnectorConfig(): Record<string, Readonly<Record<string, string>>> {
  const env = getEnv();
  const eigenlayer: Record<string, string> = {};
  if (env.EIGENLAYER_REWARDS_COORDINATOR)
    eigenlayer.rewardsCoordinator = env.EIGENLAYER_REWARDS_COORDINATOR;
  if (env.EIGENLAYER_SIDECAR_URL) eigenlayer.sidecarUrl = env.EIGENLAYER_SIDECAR_URL;
  if (env.EIGENLAYER_CLAIM_URL) eigenlayer.claimUrl = env.EIGENLAYER_CLAIM_URL;

  return {
    "eigenlayer-rewards": eigenlayer,
  };
}

/**
 * Build a DiscoveryEngine wired with production defaults: the default discovery
 * registry, per-connector config from env, the shared metrics registry, and the
 * Redis-backed cache.
 */
export function createDiscoveryEngine(): DiscoveryEngine {
  return new DiscoveryEngine({
    registry: createDefaultDiscoveryRegistry(),
    connectorConfig: buildConnectorConfig(),
  });
}
