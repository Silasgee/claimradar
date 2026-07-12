/**
 * Minimal RewardsCoordinator ABI — only the read surface this connector needs.
 * Verified against Layr-Labs/eigenlayer-contracts `IRewardsCoordinator.sol`:
 *
 * - `checkClaim(RewardsMerkleClaim)` verifies a claim against the CURRENT
 *   distribution root on-chain and returns true (or reverts). This is our
 *   ground-truth: the sidecar's proof is only surfaced if the CONTRACT accepts
 *   it, so a malicious/buggy proof provider can never produce a false claim.
 * - `cumulativeClaimed(earner, token)` is what the earner has already claimed;
 *   claimable = leaf.cumulativeEarnings − cumulativeClaimed.
 * - `getCurrentDistributionRoot()` is read only for provenance (root hash).
 *
 * The connector never executes `processClaim` — it is read-only.
 */
export const REWARDS_COORDINATOR_ABI = [
  {
    type: "function",
    name: "checkClaim",
    stateMutability: "view",
    inputs: [
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "rootIndex", type: "uint32" },
          { name: "earnerIndex", type: "uint32" },
          { name: "earnerTreeProof", type: "bytes" },
          {
            name: "earnerLeaf",
            type: "tuple",
            components: [
              { name: "earner", type: "address" },
              { name: "earnerTokenRoot", type: "bytes32" },
            ],
          },
          { name: "tokenIndices", type: "uint32[]" },
          { name: "tokenTreeProofs", type: "bytes[]" },
          {
            name: "tokenLeaves",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "cumulativeEarnings", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "cumulativeClaimed",
    stateMutability: "view",
    inputs: [
      { name: "earner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCurrentDistributionRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "rewardsCalculationEndTimestamp", type: "uint32" },
          { name: "activatedAt", type: "uint32" },
          { name: "disabled", type: "bool" },
        ],
      },
    ],
  },
] as const;
