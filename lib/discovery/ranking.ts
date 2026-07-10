import { Confidence, type Claim, type ClaimStatus, type RankedClaim } from "@/types";
import { ClaimStatus as Status } from "@/types";

/**
 * Ranking Engine (Milestone 3, Phase 6).
 *
 * Produces a deterministic ordering of claims. "Deterministic" is a hard
 * requirement: the same claims + the same clock always yield the same order,
 * so rescans and cache reads are stable. Ranking is a transparent, documented
 * additive score (no opaque ML weights) — see docs/DISCOVERY_ENGINE.md.
 *
 * Higher score = higher rank. The score sums the factors the milestone
 * mandates: claim status, confidence, estimated USD value, expiration urgency,
 * protocol priority, gas cost, and risk level.
 */

/** Status contribution — CLAIMABLE dominates; spent/expired claims sink. */
export const STATUS_SCORE: Record<ClaimStatus, number> = {
  [Status.CLAIMABLE]: 1000,
  [Status.PENDING]: 200,
  [Status.ALREADY_CLAIMED]: -500,
  [Status.EXPIRED]: -1000,
};

/** Confidence contribution. */
export const CONFIDENCE_SCORE: Record<Confidence, number> = {
  [Confidence.CONFIRMED]: 300,
  [Confidence.LIKELY]: 150,
  [Confidence.ESTIMATED]: 50,
};

// Bounded weights keep any single factor from dominating and keep scores
// interpretable. Documented in docs/DISCOVERY_ENGINE.md.
const USD_WEIGHT = 0.01;
const USD_CAP = 1_000_000;
const EXPIRY_MAX_BONUS = 100;
const PRIORITY_CAP = 100;
const GAS_PENALTY_CAP = 50;
const RISK_PENALTY_PER_FLAG = 25;

const MS_PER_DAY = 86_400_000;

export interface RankingOptions {
  /** Injected clock — expiration urgency is relative to "now". */
  now: () => Date;
}

/** Compute a claim's raw composite score. Exported for testing/inspection. */
export function computeRankScore(claim: Claim, now: Date): number {
  let score = 0;

  score += STATUS_SCORE[claim.status];
  score += CONFIDENCE_SCORE[claim.confidence];

  // Estimated USD value (null until the pricing milestone → 0 contribution).
  score += Math.min(Math.max(claim.usdValue ?? 0, 0), USD_CAP) * USD_WEIGHT;

  // Expiration urgency: the sooner a live claim expires, the more it matters.
  if (claim.expiresAt) {
    const msLeft = new Date(claim.expiresAt).getTime() - now.getTime();
    if (Number.isFinite(msLeft) && msLeft > 0) {
      const daysLeft = Math.min(msLeft / MS_PER_DAY, EXPIRY_MAX_BONUS);
      score += EXPIRY_MAX_BONUS - daysLeft;
    }
  }

  // Protocol priority (trust/importance), bounded.
  score += Math.min(Math.max(claim.protocol.priority, 0), PRIORITY_CAP);

  // Gas cost penalty: costlier claims rank lower.
  if (claim.gasEstimate) {
    const gas = Number(claim.gasEstimate.gasLimit);
    if (Number.isFinite(gas)) score -= Math.min(gas / 10_000, GAS_PENALTY_CAP);
  }

  // Risk penalty.
  score -= claim.riskFlags.length * RISK_PENALTY_PER_FLAG;

  return score;
}

/**
 * Rank claims into a deterministic total order: score desc, ties broken by the
 * stable claim id (asc). Assigns 1-based `rank` and a rounded `rankScore`.
 */
export function rankClaims(claims: Claim[], options: RankingOptions): RankedClaim[] {
  const now = options.now();
  return claims
    .map((claim) => ({ claim, score: computeRankScore(claim, now) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.claim.id < b.claim.id ? -1 : a.claim.id > b.claim.id ? 1 : 0;
    })
    .map((entry, index) => ({
      ...entry.claim,
      rank: index + 1,
      rankScore: Math.round(entry.score * 100) / 100,
    }));
}
