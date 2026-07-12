import type { Address, Hex } from "viem";

/**
 * TypeScript mirror of EigenLayer's `IRewardsCoordinator.RewardsMerkleClaim`
 * (verified against Layr-Labs/eigenlayer-contracts). This is the exact struct
 * `RewardsCoordinator.checkClaim()` and `processClaim()` accept, so the objects
 * here are passed straight to viem as the tuple argument.
 *
 * `earnerTreeProof` / `tokenTreeProofs` are the concatenated 32-byte sibling
 * nodes as a single `bytes` blob (what the on-chain `Merkle.verifyInclusionKeccak`
 * consumes), NOT arrays of nodes.
 */

export interface EarnerTreeMerkleLeaf {
  earner: Address;
  earnerTokenRoot: Hex;
}

export interface TokenTreeMerkleLeaf {
  token: Address;
  cumulativeEarnings: bigint;
}

export interface RewardsMerkleClaim {
  rootIndex: number;
  earnerIndex: number;
  earnerTreeProof: Hex;
  earnerLeaf: EarnerTreeMerkleLeaf;
  tokenIndices: number[];
  tokenTreeProofs: Hex[];
  tokenLeaves: TokenTreeMerkleLeaf[];
}
