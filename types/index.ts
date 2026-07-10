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
