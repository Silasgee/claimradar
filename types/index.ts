/**
 * Core domain vocabulary shared across the app, connectors, and workers.
 *
 * These types are the stable contract of the platform: connectors emit them,
 * the API serves them, and the database persists them. Keep changes here
 * deliberate — every connector depends on this file.
 */

/** Chains ClaimRadar knows about. Mirrors the `Chain` enum in prisma/schema.prisma. */
export enum Chain {
  ETHEREUM = "ETHEREUM",
  BASE = "BASE",
  ARBITRUM = "ARBITRUM",
  OPTIMISM = "OPTIMISM",
  POLYGON = "POLYGON",
  BNB = "BNB",
  SOLANA = "SOLANA",
}

/** Categories of claimable assets. Mirrors `ClaimableCategory` in the Prisma schema. */
export enum ClaimableCategory {
  AIRDROP = "AIRDROP",
  STAKING_REWARD = "STAKING_REWARD",
  VESTING = "VESTING",
  PRESALE_ALLOCATION = "PRESALE_ALLOCATION",
  GOVERNANCE_REWARD = "GOVERNANCE_REWARD",
  NFT_CLAIM = "NFT_CLAIM",
  REFUND = "REFUND",
  OTHER = "OTHER",
}

/**
 * How sure we are that an item is truly claimable.
 * - CONFIRMED: verified against on-chain state.
 * - LIKELY: sourced from an indexer/API and may be stale.
 * - ESTIMATED: derived/heuristic value.
 */
export enum Confidence {
  CONFIRMED = "CONFIRMED",
  LIKELY = "LIKELY",
  ESTIMATED = "ESTIMATED",
}

/** Token metadata attached to a claimable. */
export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  /** Contract/mint address; null for native assets (ETH, SOL, …). */
  contractAddress: string | null;
}

/**
 * A single claimable asset discovered for an address.
 *
 * Amounts are strings: `amountRaw` is the integer base-unit amount (uint256-safe,
 * exceeds JS number precision), `amountDecimal` is the human-readable amount.
 */
export interface Claimable {
  /** Stable identifier, unique within a connector (e.g. `mock:0xabc…:airdrop`). */
  id: string;
  connectorId: string;
  chain: Chain;
  category: ClaimableCategory;
  token: TokenInfo;
  amountRaw: string;
  amountDecimal: string;
  /** USD valuation added by the enrichment stage; null until priced. */
  usdValue: number | null;
  /** Official claim page. Must pass the claim-URL allow-list before display. */
  claimUrl: string;
  /** Contract the claim would be executed against. */
  contractAddress: string;
  /** End of the claim window, if any (ISO 8601). */
  expiresAt: string | null;
  confidence: Confidence;
  /** e.g. "unverified_contract", "expiring_soon". */
  riskFlags: string[];
  /** Connector-specific payload preserved for explainability and replay. */
  rawPayload?: unknown;
}

/** Lifecycle states of a scan. Mirrors `ScanStatus` in prisma/schema.prisma. */
export enum ScanStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  PARTIAL = "PARTIAL",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
}

/** Terminal states of a single connector execution within a scan. */
export enum ConnectorRunStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  TIMEOUT = "TIMEOUT",
  CANCELLED = "CANCELLED",
}

/**
 * Per-connector execution summary attached to a scan report. Serializable and
 * client-safe: errors are reduced to code + message (never stacks or causes).
 */
export interface ConnectorRunSummary {
  connectorId: string;
  status: ConnectorRunStatus;
  /** Total attempts made (1 = no retries needed). */
  attempts: number;
  durationMs: number;
  /** Claimables that survived normalization; 0 for non-success runs. */
  itemsFound: number;
  error?: { code: string; message: string };
}

/**
 * The aggregate result of one scan: merged, deduplicated, deterministically
 * sorted claimables plus per-connector provenance.
 *
 * - COMPLETE: every applicable connector succeeded (or none applied).
 * - PARTIAL: some connectors failed but at least one succeeded.
 * - FAILED: every applicable connector failed.
 */
export interface ScanReport {
  scanId: string;
  address: string;
  status: ScanStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  claimables: Claimable[];
  connectorRuns: ConnectorRunSummary[];
}

/** A request to scan one address, possibly restricted to specific chains. */
export interface ScanRequest {
  /** Public wallet address (EVM 0x… or Solana base58). Validation is the caller's job. */
  address: string;
  /** Restrict the scan to these chains; undefined = all chains the connector supports. */
  chains?: Chain[];
}

/** What a single connector returns for a single scan request. */
export interface ScanResponse {
  connectorId: string;
  address: string;
  claimables: Claimable[];
  /** When the connector produced this result (ISO 8601). */
  scannedAt: string;
}

// ---------------------------------------------------------------------------
// Discovery Engine — canonical Claim model (Milestone 3)
//
// The `Claim` type below is the platform's permanent, canonical representation
// of a discovered claim opportunity. It is deliberately richer than the
// Scan Engine's `Claimable` (which models a raw on-chain asset finding): a
// Claim carries lifecycle state, provenance, protocol identity, gas/value
// estimation, and ranking fields. Both intentionally reuse the shared
// `Chain` / `ClaimableCategory` / `Confidence` enums above — no duplication.
//
// The full specification lives in docs/CLAIM_MODEL.md. This model is designed
// so that supporting 100+ protocols later requires no breaking changes:
// protocol-specific detail goes in `metadata` (non-authoritative) and
// `provenance`, never in new top-level fields.
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a claim for a specific wallet.
 * See docs/CLAIM_MODEL.md for the state machine.
 */
export enum ClaimStatus {
  /** Eligible and not yet claimed — the actionable state. */
  CLAIMABLE = "CLAIMABLE",
  /** Eligible but already claimed by this wallet. */
  ALREADY_CLAIMED = "ALREADY_CLAIMED",
  /** Was claimable but the claim window has closed. */
  EXPIRED = "EXPIRED",
  /** Eligible but not yet active (e.g. vesting cliff not reached). */
  PENDING = "PENDING",
}

/** How a claim's data was sourced (blueprint §9.6 accessMode). */
export type ClaimSource = "onchain" | "indexer" | "api" | "hybrid";

/** The protocol a claim belongs to. `priority` drives ranking tiebreaks. */
export interface ProtocolInfo {
  id: string;
  name: string;
  /** Higher = more trusted/important protocol. Set from connector priority. */
  priority: number;
}

/**
 * Where a claim came from and how it was verified — the explainability record
 * (blueprint §1.7). Stamped by the engine from connector metadata; a connector
 * cannot forge it.
 */
export interface ClaimProvenance {
  connectorId: string;
  connectorVersion: string;
  source: ClaimSource;
  chain: Chain;
  /** Contract the claim reads from / would be executed against. */
  contractAddress: string;
  /** On-chain method that produced the finding, e.g. "isClaimed(uint256)". */
  method: string | null;
  /** Block the read was pinned to, if any. */
  blockNumber: string | null;
  /** When the claim was discovered (ISO 8601, from the injected clock). */
  discoveredAt: string;
}

/** Optional gas estimate for executing the claim. */
export interface GasEstimate {
  /** Estimated gas units (uint256-safe string). */
  gasLimit: string;
}

/**
 * The canonical claim opportunity. Amounts are strings (uint256-safe).
 * `id` is deterministic and stable across rescans — see lib/discovery/claim-id.
 */
export interface Claim {
  id: string;
  /** Wallet the claim belongs to (lowercased). */
  wallet: string;
  chain: Chain;
  protocol: ProtocolInfo;
  category: ClaimableCategory;
  /** Protocol sub-type, part of the stable id (e.g. "merkle-airdrop"). */
  claimType: string;
  status: ClaimStatus;
  token: TokenInfo;
  amountRaw: string;
  amountDecimal: string;
  /** USD valuation, added by a future enrichment stage; null until priced. */
  usdValue: number | null;
  gasEstimate: GasEstimate | null;
  confidence: Confidence;
  riskFlags: string[];
  /** Official claim page. Validated http(s) + domain allow-list before display. */
  claimUrl: string;
  /** Claim window end, if any (ISO 8601). */
  expiresAt: string | null;
  provenance: ClaimProvenance;
  /** Protocol-specific, non-authoritative detail. Never used for ranking. */
  metadata: Record<string, unknown>;
}

/** A claim with its deterministic ranking assigned by the Ranking Engine. */
export interface RankedClaim extends Claim {
  /** 1-based position in the ranked result. */
  rank: number;
  /** Deterministic composite score (see lib/discovery/ranking). */
  rankScore: number;
}

/** A request to discover claims for one wallet, optionally chain-restricted. */
export interface DiscoveryRequest {
  wallet: string;
  chains?: Chain[];
}

/** What a single discovery connector returns. */
export interface DiscoveryResult {
  claims: Claim[];
}

/** Per-connector execution summary within a discovery run (client-safe). */
export interface DiscoveryConnectorRunSummary {
  connectorId: string;
  protocolId: string;
  status: ConnectorRunStatus;
  attempts: number;
  durationMs: number;
  /** Claims that survived normalization; 0 for non-success runs. */
  claimsFound: number;
  error?: { code: string; message: string };
}

/**
 * The aggregate result of one discovery run: normalized, deduplicated,
 * deterministically ranked claims plus per-connector provenance and stats.
 * Reuses `ScanStatus` (COMPLETE / PARTIAL / FAILED) for the aggregate outcome.
 */
export interface DiscoveryReport {
  discoveryId: string;
  wallet: string;
  status: ScanStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  claims: RankedClaim[];
  connectorRuns: DiscoveryConnectorRunSummary[];
  stats: {
    /** Valid claims produced by connectors before dedup. */
    discovered: number;
    /** Duplicate claims removed during merge. */
    duplicatesRemoved: number;
    /** Malformed claims rejected during normalization. */
    dropped: number;
    rankingDurationMs: number;
  };
}
