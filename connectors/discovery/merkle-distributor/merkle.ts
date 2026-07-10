import { concat, encodePacked, keccak256, type Address, type Hex } from "viem";

/**
 * Uniswap-style Merkle Distributor tree math.
 *
 * - Leaf:   keccak256(abi.encodePacked(index, account, amount))
 * - Node:   keccak256(sorted(a, b))   (pairs are hashed in ascending byte order)
 *
 * `verifyProof` reproduces the exact check the on-chain distributor performs,
 * so a locally verified proof against the on-chain `merkleRoot()` is
 * ground-truth eligibility (confidence CONFIRMED).
 */

export interface MerkleEntry {
  index: number;
  account: Address;
  amountRaw: string;
}

/** Compute the leaf hash for a claim entry. */
export function computeLeaf(entry: MerkleEntry): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [BigInt(entry.index), entry.account, BigInt(entry.amountRaw)],
    ),
  );
}

/** Hash a pair of nodes in sorted (ascending) order. */
function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/** Verify a proof folds the leaf up to `root`. */
export function verifyProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  let computed = leaf;
  for (const element of proof) {
    computed = hashPair(computed, element);
  }
  return computed.toLowerCase() === root.toLowerCase();
}

/**
 * Build a full tree from entries — returns the root and a proof per leaf
 * (keyed by leaf hash). Used for test fixtures and offline data preparation,
 * not on the hot path (a production connector holds only each wallet's proof).
 */
export function buildMerkleTree(entries: MerkleEntry[]): {
  root: Hex;
  proofs: Map<Hex, Hex[]>;
} {
  const leaves = entries.map(computeLeaf);
  const proofs = new Map<Hex, Hex[]>(leaves.map((leaf) => [leaf, []]));

  // Track, for every original leaf, its current node hash as we climb levels.
  let level = leaves.map((leaf, i) => ({ hash: leaf, leafIndices: [i] }));
  const leafHashByIndex = leaves;

  while (level.length > 1) {
    const next: { hash: Hex; leafIndices: number[] }[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      if (!right) {
        // Odd node promoted unchanged.
        next.push(left);
        continue;
      }
      const parentHash = hashPair(left.hash, right.hash);
      // Each leaf under `left` gets `right.hash` as its next proof element,
      // and vice versa.
      for (const li of left.leafIndices) proofs.get(leafHashByIndex[li]!)!.push(right.hash);
      for (const ri of right.leafIndices) proofs.get(leafHashByIndex[ri]!)!.push(left.hash);
      next.push({ hash: parentHash, leafIndices: [...left.leafIndices, ...right.leafIndices] });
    }
    level = next;
  }

  return { root: level[0]!.hash, proofs };
}
