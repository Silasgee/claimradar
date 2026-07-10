import type { Address, Hex } from "viem";

/**
 * Eligibility dataset for the Merkle Distributor connector.
 *
 * In production this is the protocol's OFFICIAL published claims file (index,
 * account, amount, proof), loaded from the protocol's release/CDN. Bundled
 * here is a small, self-consistent SAMPLE tree so the connector is exercisable
 * end-to-end (its proofs verify against the tree's root). Point the connector
 * at a real distributor + its published list to make it production-live.
 *
 * The sample root is exported so tests (and a mocked chain) can return it from
 * `merkleRoot()`; the connector NEVER trusts this constant — it always reads
 * the root on-chain and verifies each proof against it.
 */

export interface EligibilityEntry {
  index: number;
  account: Address;
  amountRaw: string;
  proof: Hex[];
}

/** Root of the bundled sample tree (matches the proofs below). */
export const SAMPLE_MERKLE_ROOT: Hex =
  "0x7e597f19b874dc1b398d6d753397648ca387e2d97eef53eb3dea595490386957";

const ENTRIES: EligibilityEntry[] = [
  {
    index: 0,
    account: "0x000000000000000000000000000000000000bEEF",
    amountRaw: "1000000000000000000000",
    proof: [
      "0xd41a5e85478f317ca1af3829be47e8e2d029b82672fc436c789f2e0d89fdfc86",
      "0xa997abd35b6f465eb6094546ffe7bb7cf95b30023e1a135bb1ebe1ec9c1d0913",
    ],
  },
  {
    index: 1,
    account: "0x1111111111111111111111111111111111111111",
    amountRaw: "500000000000000000000",
    proof: [
      "0xe8a192ffa49812f243bc641a6f4f750b9ab6d6793f7f6a794044bc11b1d0f185",
      "0xa997abd35b6f465eb6094546ffe7bb7cf95b30023e1a135bb1ebe1ec9c1d0913",
    ],
  },
  {
    index: 2,
    account: "0x2222222222222222222222222222222222222222",
    amountRaw: "250000000000000000000",
    proof: [
      "0xf1b96fc81a15cf26a2d218611f5061a7012e8c12245657f8ea0433192da2d307",
      "0xf1949fa903fcd9ad4016b912bf05e5c424d28d1482c9f6215b2f9f71c8c38ec2",
    ],
  },
  {
    index: 3,
    account: "0x3333333333333333333333333333333333333333",
    amountRaw: "4200000000000000000000",
    proof: [
      "0x90621d36307e0434b4880006428e991b64fce6cf84f82f96fe86f1007948f9c4",
      "0xf1949fa903fcd9ad4016b912bf05e5c424d28d1482c9f6215b2f9f71c8c38ec2",
    ],
  },
];

/** Index the dataset by lowercased account for O(1) lookup. */
const BY_ACCOUNT: ReadonlyMap<string, EligibilityEntry> = new Map(
  ENTRIES.map((entry) => [entry.account.toLowerCase(), entry]),
);

/** Look up a wallet's eligibility entry, or undefined if not eligible. */
export function findEligibility(wallet: string): EligibilityEntry | undefined {
  return BY_ACCOUNT.get(wallet.toLowerCase());
}
