import type { PublicClient } from "viem";

import type { CacheStore } from "@/lib/cache";
import type { Logger } from "@/lib/logger";
import type { Chain, ClaimableCategory, ScanRequest, ScanResponse } from "@/types";

/**
 * The Connector SDK.
 *
 * Every protocol integration (an airdrop, a staking program, a vesting
 * contract, …) is a self-contained connector implementing this interface.
 * The core platform knows nothing protocol-specific — it only speaks
 * `ScanRequest` in and `ScanResponse` out.
 *
 * Design rules:
 * - Connectors receive ALL capabilities (logging, caching, config, time,
 *   cancellation) through the injected {@link ConnectorContext}. They must not
 *   create their own clients or read global state. This keeps them
 *   deterministic, unit-testable, and impossible to run outside the runtime's
 *   rate limits and observability.
 * - Connectors must be read-only and side-effect-free with respect to chains.
 * - Failures must throw a `ConnectorError` subclass (see ./errors).
 */

/** Static, declarative facts about a connector. */
export interface ConnectorMetadata {
  /** Globally unique slug, kebab-case (e.g. "arbitrum-airdrop-merkle"). */
  id: string;
  displayName: string;
  /** Semver. Bumping it invalidates the connector's cache namespace. */
  version: string;
  category: ClaimableCategory;
  /** Chains this connector can answer for. */
  chains: Chain[];
}

/**
 * Capabilities injected into every connector call.
 *
 * Logging, caching, config, a clock, cancellation, and read-only chain
 * access. Future milestones extend this with indexer clients and price
 * lookups — connectors gain capabilities without changing their signatures.
 */
export interface ConnectorContext {
  /** Structured logger, pre-scoped to the connector id. */
  logger: Logger;
  /** Cache namespaced to this connector id + version. */
  cache: CacheStore;
  /** Connector-specific configuration (injected, never read from process.env). */
  config: Readonly<Record<string, string>>;
  /**
   * Injected clock. Use this instead of `new Date()` so results are
   * deterministic under test and replay.
   */
  now: () => Date;
  /**
   * Read-only chain client from the Chain Access Layer (blueprint §9.2).
   * Connectors must obtain ALL chain access here — never construct their own
   * clients — so provider config, timeouts, and future failover/rate limiting
   * stay centralized. Throws ChainNotConfiguredError for unsupported chains.
   */
  chain: (chain: Chain) => PublicClient;
  /** Cooperative cancellation — honored by the runtime's timeout handling. */
  signal?: AbortSignal;
}

export interface Connector {
  readonly metadata: ConnectorMetadata;

  /**
   * Cheap, synchronous pre-filter: can this connector possibly have results
   * for this request? Used to avoid fanning out irrelevant work (e.g. an
   * EVM-only connector skips Solana addresses).
   */
  supports(request: ScanRequest): boolean;

  /**
   * Execute the scan. Must be idempotent and read-only.
   * Throw a `ConnectorError` subclass on failure; return an empty
   * `claimables` array when there is simply nothing to claim.
   */
  scan(ctx: ConnectorContext, request: ScanRequest): Promise<ScanResponse>;
}
