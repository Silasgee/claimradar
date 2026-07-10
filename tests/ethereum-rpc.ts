import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  multicall3Abi,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

import { ChainNotConfiguredError, type ChainAccess } from "@/lib/chain";
import { Chain } from "@/types";

/**
 * Mocked Ethereum RPC for integration tests — no network.
 *
 * The mock sits at the TRANSPORT level (viem `custom` transport), so tests
 * exercise the real viem client, real multicall3 ABI encoding/decoding, and
 * the real connector code path. Only the JSON-RPC responses are faked.
 */

export interface MockRpcOptions {
  /** Wei. */
  nativeBalance?: bigint;
  /** Lowercased token address → balance (base units). Missing tokens read 0. */
  tokenBalances?: Record<string, bigint>;
  /** Lowercased token addresses whose balanceOf reads fail (success=false). */
  failTokens?: string[];
  /** Observe every JSON-RPC method invoked (for batching assertions). */
  onRequest?: (method: string) => void;
  /** Simulate a dead RPC: every request rejects. */
  failRpc?: boolean;
  /** Simulate a hung RPC: requests never settle. */
  hang?: boolean;
}

export function createMockEthereumClient(opts: MockRpcOptions = {}): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        opts.onRequest?.(method);

        if (opts.hang) return new Promise(() => {});
        if (opts.failRpc) throw new Error("simulated rpc outage");

        if (method === "eth_getBalance") {
          return toHex(opts.nativeBalance ?? 0n);
        }

        if (method === "eth_call") {
          const [call] = params as [{ to: Address; data: Hex }];
          // Decode the real multicall3 aggregate3 request viem produced…
          const decoded = decodeFunctionData({ abi: multicall3Abi, data: call.data });
          const calls = decoded.args[0] as readonly { target: Address; callData: Hex }[];
          // …and answer each inner balanceOf from the fixture.
          const results = calls.map(({ target }) => {
            const key = target.toLowerCase();
            if (opts.failTokens?.includes(key)) {
              return { success: false, returnData: "0x" as Hex };
            }
            const balance = opts.tokenBalances?.[key] ?? 0n;
            return {
              success: true,
              returnData: encodeAbiParameters([{ type: "uint256" }], [balance]),
            };
          });
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: "aggregate3",
            result: results,
          });
        }

        throw new Error(`mock rpc: unexpected method ${method}`);
      },
    }),
  }) as PublicClient;
}

/** ChainAccess stub serving the mocked client for Ethereum only. */
export function mockChainAccess(client: PublicClient): ChainAccess {
  return {
    getClient(chain: Chain): PublicClient {
      if (chain !== Chain.ETHEREUM) throw new ChainNotConfiguredError(chain);
      return client;
    },
  };
}
