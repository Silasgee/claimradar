import type { PublicClient } from "viem";

import type { CacheStore } from "@/lib/cache";
import type { Logger } from "@/lib/logger";
import type {
  Chain,
  ClaimableCategory,
  ClaimSource,
  DiscoveryRequest,
  DiscoveryResult,
} from "@/types";

/**
 * Discovery Connector SDK (Milestone 3, Phase 4).
 *
 * A discovery connector encodes the BUSINESS RULES of one protocol: it decides
 * what a wallet can claim and interprets on-chain / off-chain data into the
 * canonical `Claim` model. It sits above the Scan Engine and the Chain Access
 * Layer.
 *
 * Hard rules (enforced by review + this contract):
 * - A connector NEVER instantiates RPC clients or knows how providers work. It
 *   reads chains only through the injected `ctx.chain()` (Chain Access Layer).
 * - A connector NEVER bypasses logging, metrics, or caching — all arrive via
 *   the injected `DiscoveryContext`. There is no other way in.
 * - A connector is untrusted: its output is validated and re-stamped by the
 *   Discovery Engine. It must be read-only, idempotent, and deterministic
 *   given the injected clock.
 *
 * The full contract lives in docs/CONNECTOR_SDK.md.
 */

/** Capabilities injected into every `discover()` / `health()` call. */
export interface DiscoveryContext {
  /** Structured logger, pre-scoped to the connector id. */
  logger: Logger;
  /** Cache namespaced to this connector id + version. */
  cache: CacheStore;
  /** Connector-specific configuration (injected, never read from process.env). */
  config: Readonly<Record<string, string>>;
  /** Injected clock — use instead of `new Date()` for deterministic output. */
  now: () => Date;
  /**
   * Read-only chain client from the Chain Access Layer. The ONLY way a
   * discovery connector may touch a chain. Throws ChainNotConfiguredError for
   * chains it is not configured for.
   */
  chain: (chain: Chain) => PublicClient;
  /** Cooperative cancellation — honored by the runtime's timeout handling. */
  signal?: AbortSignal;
}

/** Static, declarative facts about a discovery connector. */
export interface DiscoveryConnectorMetadata {
  /** Globally unique slug, kebab-case (e.g. "merkle-distributor"). */
  id: string;
  displayName: string;
  /** The protocol this connector discovers claims for. */
  protocol: { id: string; name: string };
}

/**
 * What a connector can do — used for selection, ranking, and security.
 * Declarative so the engine and admin plane can reason about connectors
 * without running them.
 */
export interface ConnectorCapabilities {
  /** How the connector sources data (blueprint §9.6). */
  accessMode: ClaimSource;
  /** Claim categories this connector can produce. */
  categories: ClaimableCategory[];
  /** Whether `discover()` can populate `gasEstimate`. */
  gasEstimation: boolean;
  /**
   * Domains this connector is permitted to emit claim URLs for. The engine
   * rejects any claim URL whose host is not on this list (∪ the global
   * allow-list). See lib/discovery/claim-url.
   */
  trustedDomains: string[];
}

/** Health probe result for a connector's upstream dependencies. */
export interface HealthStatus {
  healthy: boolean;
  detail?: string;
}

/**
 * The discovery connector contract. The member set is intentionally exactly
 * the Phase 4 surface: metadata, supportedChains(), discover(), health(),
 * capabilities(), version, priority.
 */
export interface DiscoveryConnector {
  readonly metadata: DiscoveryConnectorMetadata;
  /** Semver. Bumping it invalidates the connector's cache namespace. */
  readonly version: string;
  /** Ranking/tiebreak weight for this connector's protocol (higher = stronger). */
  readonly priority: number;

  /** Chains this connector can discover claims on. */
  supportedChains(): Chain[];

  /** Declarative capabilities (selection, ranking, security). */
  capabilities(): ConnectorCapabilities;

  /**
   * Discover claims for a wallet. Must be read-only, idempotent, and return an
   * empty `claims` array when there is nothing to claim. Throw a
   * `ConnectorError` subclass on failure — the engine isolates it.
   */
  discover(ctx: DiscoveryContext, request: DiscoveryRequest): Promise<DiscoveryResult>;

  /** Probe upstream reachability without running a full discovery. */
  health(ctx: DiscoveryContext): Promise<HealthStatus>;
}
