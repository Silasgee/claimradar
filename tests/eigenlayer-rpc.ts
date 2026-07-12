import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  multicall3Abi,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

import { REWARDS_COORDINATOR_ABI } from "@/connectors/discovery/eigenlayer/abi";
import type { EigenLayerProofProvider } from "@/connectors/discovery/eigenlayer/proof-provider";
import type { RewardsMerkleClaim } from "@/connectors/discovery/eigenlayer/types";
import { ChainNotConfiguredError, type ChainAccess } from "@/lib/chain";
import { Chain } from "@/types";

/**
 * Mocked EigenLayer RewardsCoordinator + ERC-20 RPC for integration tests.
 * Mocks at the viem transport level so the real client, real multicall3
 * aggregate3 encode/decode, and the real connector path all run — only the
 * JSON-RPC responses are faked. No network.
 */

export interface TokenMetaFixture {
  symbol: string;
  name: string;
  decimals: number;
}

export interface MockEigenOptions {
  /** checkClaim result: true = valid, false = returns false, "revert" = reverts. */
  checkClaim: boolean | "revert";
  /** cumulativeClaimed keyed by lowercased token address (default 0). */
  claimed?: Record<string, bigint>;
  /** ERC-20 metadata keyed by lowercased token address. */
  tokenMeta?: Record<string, TokenMetaFixture>;
  /** Fail all reads at the transport level (simulated network failure). */
  failReads?: boolean;
  /** Fail only ERC-20 metadata reads (exercises the connector's fallback). */
  failTokenMeta?: boolean;
  /** Never settle (timeout testing). */
  hang?: boolean;
}

const DEFAULT_META: TokenMetaFixture = { symbol: "TKN", name: "Token", decimals: 18 };

/** Resolve a single aggregate3 inner call. */
function answerCall(
  target: Address,
  callData: Hex,
  opts: MockEigenOptions,
): { success: boolean; returnData: Hex } {
  // ERC-20 metadata (keyed by target token address).
  try {
    const erc = decodeFunctionData({ abi: erc20Abi, data: callData });
    if (
      erc.functionName === "symbol" ||
      erc.functionName === "name" ||
      erc.functionName === "decimals"
    ) {
      if (opts.failTokenMeta) return { success: false, returnData: "0x" };
      const meta = opts.tokenMeta?.[target.toLowerCase()] ?? DEFAULT_META;
      if (erc.functionName === "decimals") {
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: erc20Abi,
            functionName: "decimals",
            result: meta.decimals,
          }),
        };
      }
      return {
        success: true,
        returnData: encodeFunctionResult({
          abi: erc20Abi,
          functionName: erc.functionName,
          result: erc.functionName === "symbol" ? meta.symbol : meta.name,
        }),
      };
    }
  } catch {
    // Not an ERC-20 call — fall through to the coordinator ABI.
  }

  const decoded = decodeFunctionData({ abi: REWARDS_COORDINATOR_ABI, data: callData });
  if (decoded.functionName === "checkClaim") {
    if (opts.checkClaim === "revert") return { success: false, returnData: "0x" };
    return {
      success: true,
      returnData: encodeFunctionResult({
        abi: REWARDS_COORDINATOR_ABI,
        functionName: "checkClaim",
        result: opts.checkClaim,
      }),
    };
  }
  if (decoded.functionName === "cumulativeClaimed") {
    const token = (decoded.args[1] as Address).toLowerCase();
    return {
      success: true,
      returnData: encodeFunctionResult({
        abi: REWARDS_COORDINATOR_ABI,
        functionName: "cumulativeClaimed",
        result: opts.claimed?.[token] ?? 0n,
      }),
    };
  }
  if (decoded.functionName === "getCurrentDistributionRoot") {
    // Reachability sentinel — always succeeds when the chain is reachable.
    return {
      success: true,
      returnData: encodeFunctionResult({
        abi: REWARDS_COORDINATOR_ABI,
        functionName: "getCurrentDistributionRoot",
        result: {
          root: `0x${"dd".repeat(32)}`,
          rewardsCalculationEndTimestamp: 1_700_000_000,
          activatedAt: 1_700_000_100,
          disabled: false,
        },
      }),
    };
  }
  throw new Error("mock eigenlayer: unexpected coordinator call");
}

export function createMockEigenClient(opts: MockEigenOptions): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        if (opts.hang) return new Promise(() => {});
        if (method === "eth_chainId") return toHex(mainnet.id);
        if (method === "eth_call") {
          if (opts.failReads) throw new Error("simulated read failure");
          const [call] = params as [{ to: Address; data: Hex }];
          const decoded = decodeFunctionData({ abi: multicall3Abi, data: call.data });
          if (decoded.functionName !== "aggregate3") {
            throw new Error("mock eigenlayer: expected aggregate3 multicall");
          }
          const calls = decoded.args[0] as readonly { target: Address; callData: Hex }[];
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: "aggregate3",
            result: calls.map(({ target, callData }) => answerCall(target, callData, opts)),
          });
        }
        throw new Error(`mock eigenlayer rpc: unexpected method ${method}`);
      },
    }),
  }) as PublicClient;
}

/** ChainAccess stub serving the mocked client for Ethereum only. */
export function mockEigenChainAccess(client: PublicClient): ChainAccess {
  return {
    getClient(chain: Chain): PublicClient {
      if (chain !== Chain.ETHEREUM) throw new ChainNotConfiguredError(chain);
      return client;
    },
  };
}

/** In-memory proof provider for tests — returns a fixed proof (or null). */
export class StubProofProvider implements EigenLayerProofProvider {
  constructor(
    private readonly proof: RewardsMerkleClaim | null,
    private readonly opts: { throwError?: Error; healthy?: boolean } = {},
  ) {}

  async getRewardProof(): Promise<RewardsMerkleClaim | null> {
    if (this.opts.throwError) throw this.opts.throwError;
    return this.proof;
  }

  async health(): Promise<boolean> {
    return this.opts.healthy ?? true;
  }
}
