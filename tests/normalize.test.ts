import { describe, expect, it } from "vitest";

import { compareClaimables, mergeClaimables, normalizeScanResponse } from "@/lib/scan";
import type { ScanResponse } from "@/types";

import { StubConnector, TEST_ADDRESS, createTestLogger, makeClaimable } from "./helpers";

const connector = new StubConnector({ id: "norm" });

function response(claimables: unknown[]): ScanResponse {
  return {
    connectorId: "norm",
    address: TEST_ADDRESS,
    claimables: claimables as ScanResponse["claimables"],
    scannedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("normalizeScanResponse", () => {
  it("accepts conforming claimables unchanged (except provenance stamp)", () => {
    const input = makeClaimable({ id: "ok", connectorId: "norm" });
    const { claimables, dropped } = normalizeScanResponse(
      connector,
      response([input]),
      createTestLogger(),
    );

    expect(dropped).toBe(0);
    expect(claimables).toHaveLength(1);
    expect(claimables[0]).toMatchObject({ id: "ok", connectorId: "norm" });
  });

  it.each([
    ["non-integer amountRaw", makeClaimable({ amountRaw: "1.5" })],
    ["negative-style amountRaw", makeClaimable({ amountRaw: "-10" })],
    ["invalid claim URL", makeClaimable({ claimUrl: "javascript:alert(1)" })],
    ["unknown chain", { ...makeClaimable(), chain: "DOGECOIN" }],
    ["missing token", { ...makeClaimable(), token: undefined }],
    ["empty id", makeClaimable({ id: "" })],
    ["arbitrary custom shape", { totallyCustom: true, amount: 5 }],
  ])("drops %s", (_label, item) => {
    const { claimables, dropped } = normalizeScanResponse(
      connector,
      response([item]),
      createTestLogger(),
    );
    expect(claimables).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("keeps valid items while dropping invalid neighbors", () => {
    const { claimables, dropped } = normalizeScanResponse(
      connector,
      response([makeClaimable({ id: "keep" }), { junk: true }]),
      createTestLogger(),
    );
    expect(claimables.map((c) => c.id)).toEqual(["keep"]);
    expect(dropped).toBe(1);
  });
});

describe("compareClaimables / mergeClaimables", () => {
  it("sorts by usdValue desc with unpriced last, then amount, then connectorId, then id", () => {
    const items = [
      makeClaimable({ id: "b", connectorId: "z", usdValue: 10 }),
      makeClaimable({ id: "a", connectorId: "a", usdValue: 10 }),
      makeClaimable({ id: "unpriced", usdValue: null }),
      makeClaimable({ id: "top", usdValue: 500 }),
      makeClaimable({ id: "same-conn-2", connectorId: "a", usdValue: 10 }),
    ];

    const sorted = [...items].sort(compareClaimables);
    expect(sorted.map((c) => c.id)).toEqual(["top", "a", "same-conn-2", "b", "unpriced"]);
  });

  it("merge is idempotent and deterministic for identical input in any order", () => {
    const items = [
      makeClaimable({ id: "1", usdValue: 5 }),
      makeClaimable({ id: "2", usdValue: 50 }),
      makeClaimable({ id: "1", usdValue: 5, connectorId: "other" }),
    ];

    const forward = mergeClaimables(items);
    const reversed = mergeClaimables([...items].reverse());

    expect(forward.map((c) => c.id)).toEqual(["2", "1"]);
    expect(reversed).toEqual(forward);
    expect(mergeClaimables(forward)).toEqual(forward);
  });
});
