import { ClaimStatus, type DiscoveryReport, type RankedClaim } from "@/types";

import { CHAIN_LABEL } from "./claims";
import { daysUntil } from "./format";

/** Aggregate a report into the numbers the results summary renders. Pure. */
export interface ResultsSummary {
  totalClaims: number;
  actionableClaims: number;
  /** Sum of priced claims, or null when nothing is priced yet. */
  totalValueUsd: number | null;
  pricedCount: number;
  highestValue: RankedClaim | null;
  expiringSoon: RankedClaim[];
  byProtocol: BreakdownRow[];
  byChain: BreakdownRow[];
}

export interface BreakdownRow {
  label: string;
  count: number;
}

const EXPIRING_SOON_DAYS = 30;

export function summarize(report: DiscoveryReport): ResultsSummary {
  const claims = report.claims;
  const priced = claims.filter((c) => c.usdValue !== null);
  const totalValueUsd = priced.length
    ? priced.reduce((sum, c) => sum + (c.usdValue ?? 0), 0)
    : null;

  const highestValue = priced.length
    ? priced.reduce((best, c) => ((c.usdValue ?? 0) > (best.usdValue ?? 0) ? c : best))
    : (claims[0] ?? null); // fall back to top-ranked when unpriced

  const expiringSoon = claims.filter((c) => {
    if (c.status !== ClaimStatus.CLAIMABLE) return false;
    const days = daysUntil(c.expiresAt);
    return days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
  });

  return {
    totalClaims: claims.length,
    actionableClaims: claims.filter((c) => c.status === ClaimStatus.CLAIMABLE).length,
    totalValueUsd,
    pricedCount: priced.length,
    highestValue,
    expiringSoon,
    byProtocol: countBy(claims, (c) => c.protocol.name),
    byChain: countBy(claims, (c) => CHAIN_LABEL[c.chain] ?? c.chain),
  };
}

function countBy(claims: RankedClaim[], key: (c: RankedClaim) => string): BreakdownRow[] {
  const map = new Map<string, number>();
  for (const claim of claims) map.set(key(claim), (map.get(key(claim)) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
