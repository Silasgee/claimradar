import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

import { MERKLE_DISTRIBUTOR_ABI } from "@/connectors/discovery/merkle-distributor/abi";
import { ChainNotConfiguredError, type ChainAccess } from "@/lib/chain";
import { Chain } from "@/types";

/**
 * Mocked Merkle Distributor RPC for integration tests — no network.
 *
 * Mocks at the viem transport level, so tests exercise the real client, real
 * multicall3 aggregate3 encode/decode, and the real connector code path. Only
 * the JSON-RPC responses are faked.
 */

export interface MockMerkleOptions {
  merkleRoot: Hex;
  claimed: boolean;
  /** Gas returned by eth_estimateGas; omit to make estimation fail. */
  gas?: bigint;
  /** Fail all contract reads (merkleRoot/isClaimed). */
  failReads?: boolean;
  /** Never settle any request (timeout testing). */
  hang?: boolean;
  onRequest?: (method: string) => void;
}

function answerCall(data: Hex, opts: MockMerkleOptions): Hex {
  const { functionName } = decodeFunctionData({ abi: MERKLE_DISTRIBUTOR_ABI, data });
  if (functionName === "merkleRoot") {
    return encodeFunctionResult({
      abi: MERKLE_DISTRIBUTOR_ABI,
      functionName: "merkleRoot",
      result: opts.merkleRoot,
    });
  }
  if (functionName === "isClaimed") {
    return encodeFunctionResult({
      abi: MERKLE_DISTRIBUTOR_ABI,
      functionName: "isClaimed",
      result: opts.claimed,
    });
  }
  throw new Error(`mock merkle: unexpected function ${functionName}`);
}

export function createMockMerkleClient(opts: MockMerkleOptions): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        opts.onRequest?.(method);
        if (opts.hang) return new Promise(() => {});
        if (method === "eth_chainId") return toHex(mainnet.id);

        if (method === "eth_call") {
          const [call] = params as [{ to: Address; data: Hex }];
          // Try to decode as a multicall3 aggregate3 batch first.
          try {
            const decoded = decodeFunctionData({ abi: multicall3Abi, data: call.data });
            if (decoded.functionName === "aggregate3") {
              const calls = decoded.args[0] as readonly { callData: Hex }[];
              const results = calls.map(({ callData }) => {
                if (opts.failReads) return { success: false, returnData: "0x" as Hex };
                return { success: true, returnData: answerCall(callData, opts) };
              });
              return encodeFunctionResult({
                abi: multicall3Abi,
                functionName: "aggregate3",
                result: results,
              });
            }
          } catch {
            // Not a multicall — fall through to a direct distributor call.
          }
          if (opts.failReads) throw new Error("simulated read failure");
          return answerCall(call.data, opts);
        }

        if (method === "eth_estimateGas") {
          if (opts.gas === undefined) throw new Error("execution reverted");
          return toHex(opts.gas);
        }

        throw new Error(`mock merkle rpc: unexpected method ${method}`);
      },
    }),
  }) as PublicClient;
}

/** ChainAccess stub serving the mocked client for Ethereum only. */
export function mockMerkleChainAccess(client: PublicClient): ChainAccess {
  return {
    getClient(chain: Chain): PublicClient {
      if (chain !== Chain.ETHEREUM) throw new ChainNotConfiguredError(chain);
      return client;
    },
  };
}
