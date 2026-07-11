import { describe, expect, it } from "vitest";

import { summarize } from "@/lib/results";
import { ClaimStatus } from "@/types";

import { makeRankedClaim, makeReport } from "./fixtures";

describe("summarize", () => {
  it("counts totals, actionable claims, and protocol/chain breakdowns", () => {
    const report = makeReport([
      makeRankedClaim({ id: "a", status: ClaimStatus.CLAIMABLE }),
      makeRankedClaim({ id: "b", status: ClaimStatus.ALREADY_CLAIMED }),
    ]);
    const s = summarize(report);
    expect(s.totalClaims).toBe(2);
    expect(s.actionableClaims).toBe(1);
    expect(s.byProtocol[0]).toEqual({ label: "Example Merkle Airdrop", count: 2 });
    expect(s.byChain[0]).toEqual({ label: "Ethereum", count: 2 });
  });

  it("reports unpriced total value as null and falls back to the top claim for highest value", () => {
    const report = makeReport([makeRankedClaim({ usdValue: null })]);
    const s = summarize(report);
    expect(s.totalValueUsd).toBeNull();
    expect(s.pricedCount).toBe(0);
    expect(s.highestValue?.id).toBe("claim_v1_test");
  });

  it("sums priced claims and picks the highest priced claim", () => {
    const report = makeReport([
      makeRankedClaim({ id: "small", usdValue: 100 }),
      makeRankedClaim({ id: "big", usdValue: 900 }),
    ]);
    const s = summarize(report);
    expect(s.totalValueUsd).toBe(1000);
    expect(s.highestValue?.id).toBe("big");
  });

  it("flags claimable claims expiring within 30 days", () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const far = new Date(Date.now() + 200 * 86_400_000).toISOString();
    const report = makeReport([
      makeRankedClaim({ id: "soon", expiresAt: soon }),
      makeRankedClaim({ id: "far", expiresAt: far }),
    ]);
    expect(summarize(report).expiringSoon.map((c) => c.id)).toEqual(["soon"]);
  });
});
