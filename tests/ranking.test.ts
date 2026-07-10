import { describe, expect, it } from "vitest";

import { rankClaims } from "@/lib/discovery";
import { ClaimStatus, Confidence } from "@/types";

import { makeClaim } from "./discovery-helpers";

const NOW = () => new Date("2026-01-01T00:00:00.000Z");

describe("rankClaims", () => {
  it("assigns 1-based ranks and a rounded score, in deterministic order", () => {
    const claims = [
      makeClaim({ id: "a", status: ClaimStatus.ALREADY_CLAIMED }),
      makeClaim({ id: "b", status: ClaimStatus.CLAIMABLE }),
    ];
    const ranked = rankClaims(claims, { now: NOW });
    expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
    expect(typeof ranked[0]?.rankScore).toBe("number");
  });

  it("ranks CLAIMABLE above PENDING above ALREADY_CLAIMED above EXPIRED", () => {
    const claims = [
      makeClaim({ id: "expired", status: ClaimStatus.EXPIRED }),
      makeClaim({ id: "claimed", status: ClaimStatus.ALREADY_CLAIMED }),
      makeClaim({ id: "pending", status: ClaimStatus.PENDING }),
      makeClaim({ id: "claimable", status: ClaimStatus.CLAIMABLE }),
    ];
    expect(rankClaims(claims, { now: NOW }).map((c) => c.id)).toEqual([
      "claimable",
      "pending",
      "claimed",
      "expired",
    ]);
  });

  it("prefers higher confidence when status is equal", () => {
    const claims = [
      makeClaim({ id: "estimated", confidence: Confidence.ESTIMATED }),
      makeClaim({ id: "confirmed", confidence: Confidence.CONFIRMED }),
      makeClaim({ id: "likely", confidence: Confidence.LIKELY }),
    ];
    expect(rankClaims(claims, { now: NOW }).map((c) => c.id)).toEqual([
      "confirmed",
      "likely",
      "estimated",
    ]);
  });

  it("boosts sooner expirations and penalizes risk flags", () => {
    const soon = makeClaim({ id: "soon", expiresAt: "2026-01-02T00:00:00.000Z" });
    const later = makeClaim({ id: "later", expiresAt: "2026-06-01T00:00:00.000Z" });
    expect(rankClaims([later, soon], { now: NOW }).map((c) => c.id)).toEqual(["soon", "later"]);

    const risky = makeClaim({ id: "risky", riskFlags: ["unverified_contract"] });
    const clean = makeClaim({ id: "clean", riskFlags: [] });
    expect(rankClaims([risky, clean], { now: NOW }).map((c) => c.id)).toEqual(["clean", "risky"]);
  });

  it("is a stable total order — equal scores break ties by id, idempotently", () => {
    const claims = [makeClaim({ id: "zzz" }), makeClaim({ id: "aaa" }), makeClaim({ id: "mmm" })];
    const first = rankClaims(claims, { now: NOW }).map((c) => c.id);
    const reversed = rankClaims([...claims].reverse(), { now: NOW }).map((c) => c.id);
    expect(first).toEqual(["aaa", "mmm", "zzz"]);
    expect(reversed).toEqual(first);
  });
});
