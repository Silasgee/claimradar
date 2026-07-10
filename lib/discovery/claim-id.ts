import { createHash } from "node:crypto";

import type { Chain } from "@/types";

/**
 * Deterministic, globally stable Claim identity (Milestone 3, Phase 2).
 *
 * A claim's id must be identical across every rescan of the same opportunity,
 * so it is derived ONLY from identity dimensions that never change for a given
 * claim — never from mutable state (amount, status, timestamps, block). As a
 * merkle airdrop accrues or is claimed, its id stays constant; that stability
 * is what lets the platform track a claim over time and dedupe across
 * connectors.
 *
 * Identity dimensions (per the blueprint's provenance model):
 *   chain · protocol · contract · wallet · claimType
 *
 * The id is a version-prefixed sha256 of the canonicalized identity. The
 * version prefix lets us evolve the scheme later without collisions.
 */

export const CLAIM_ID_VERSION = "v1";

export interface ClaimIdentity {
  chain: Chain;
  /** Protocol id, e.g. "uniswap". */
  protocol: string;
  /** Contract the claim reads from / executes against. */
  contract: string;
  /** Wallet the claim belongs to. */
  wallet: string;
  /** Protocol sub-type, e.g. "merkle-airdrop". */
  claimType: string;
}

/**
 * Compute the canonical, stable claim id. Case-insensitive on all string
 * dimensions (addresses and ids are lowercased) so checksum/casing variations
 * cannot produce two ids for one claim.
 */
export function computeClaimId(identity: ClaimIdentity): string {
  const canonical = [
    CLAIM_ID_VERSION,
    identity.chain,
    identity.protocol.trim().toLowerCase(),
    identity.contract.trim().toLowerCase(),
    identity.wallet.trim().toLowerCase(),
    identity.claimType.trim().toLowerCase(),
  ].join("|");
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 40);
  return `claim_${CLAIM_ID_VERSION}_${digest}`;
}
