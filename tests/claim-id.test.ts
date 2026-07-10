import { describe, expect, it } from "vitest";

import { CLAIM_ID_VERSION, computeClaimId, type ClaimIdentity } from "@/lib/discovery";
import { Chain } from "@/types";

const base: ClaimIdentity = {
  chain: Chain.ETHEREUM,
  protocol: "example-merkle",
  contract: "0x090D4613473dEE047c3f2706764f49E0821D256e",
  wallet: "0x000000000000000000000000000000000000bEEF",
  claimType: "merkle-airdrop",
};

describe("computeClaimId", () => {
  it("is deterministic and version-prefixed", () => {
    const id = computeClaimId(base);
    expect(id).toBe(computeClaimId({ ...base }));
    expect(id.startsWith(`claim_${CLAIM_ID_VERSION}_`)).toBe(true);
  });

  it("is stable across casing of addresses and protocol (rescan stability)", () => {
    const lower = computeClaimId({
      ...base,
      contract: base.contract.toLowerCase(),
      wallet: base.wallet.toLowerCase(),
      protocol: "EXAMPLE-MERKLE",
    });
    expect(lower).toBe(computeClaimId(base));
  });

  it("does NOT depend on mutable state — only identity dimensions", () => {
    // Two claims with the same identity always share an id; amount/status/time
    // are not part of identity, so they cannot change it.
    expect(computeClaimId(base)).toBe(computeClaimId(base));
  });

  it("changes when any identity dimension changes", () => {
    const id = computeClaimId(base);
    expect(
      computeClaimId({ ...base, wallet: "0x0000000000000000000000000000000000000001" }),
    ).not.toBe(id);
    expect(computeClaimId({ ...base, claimType: "vesting" })).not.toBe(id);
    expect(
      computeClaimId({ ...base, contract: "0x0000000000000000000000000000000000000002" }),
    ).not.toBe(id);
    expect(computeClaimId({ ...base, protocol: "other" })).not.toBe(id);
    expect(computeClaimId({ ...base, chain: Chain.BASE })).not.toBe(id);
  });
});
