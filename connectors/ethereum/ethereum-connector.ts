import { erc20Abi, formatUnits, type Address } from "viem";

import type { Connector, ConnectorContext, ConnectorMetadata } from "@/connectors/connector";
import {
  Chain,
  ClaimableCategory,
  Confidence,
  type Claimable,
  type ScanRequest,
  type ScanResponse,
} from "@/types";

import { ETHEREUM_TOKENS, type TrackedToken } from "./tokens";

/**
 * EthereumConnector — the first production connector; proves the SDK against
 * real mainnet data.
 *
 * Reads, via the injected Chain Access Layer client (`ctx.chain`):
 * - native ETH balance (`eth_getBalance`), and
 * - ERC-20 balances for a curated token set — ONE `multicall` round-trip of
 *   `balanceOf` reads (batching per docs/CHAIN-ACCESS.md).
 *
 * Normalization stance: discovered balances are surfaced as `Claimable`s with
 * category OTHER ("other claimable on-chain assets") and CONFIRMED confidence
 * (direct on-chain reads are ground truth). Zero balances are omitted —
 * that's the "where appropriate". Claim-mechanism connectors (airdrops,
 * vesting) layer on in later milestones with their own categories.
 *
 * Failure semantics:
 * - Per-token read failures (multicall allowFailure) skip that token only.
 * - Anything thrown here is contained by the ConnectorRuntime — a broken RPC
 *   fails this connector's run, never the scan.
 * - Cancellation is cooperative via ctx.signal between RPC phases; the
 *   runtime's race guard enforces the hard deadline regardless.
 */

const ETHERSCAN = "https://etherscan.io";
const NATIVE_PLACEHOLDER_CONTRACT = "0x0000000000000000000000000000000000000000";

const METADATA: ConnectorMetadata = {
  id: "ethereum-assets",
  displayName: "Ethereum Wallet Assets",
  version: "1.0.0",
  category: ClaimableCategory.OTHER,
  chains: [Chain.ETHEREUM],
};

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class EthereumConnector implements Connector {
  readonly metadata = METADATA;

  supports(request: ScanRequest): boolean {
    if (request.chains && !request.chains.includes(Chain.ETHEREUM)) {
      return false;
    }
    return EVM_ADDRESS.test(request.address);
  }

  async scan(ctx: ConnectorContext, request: ScanRequest): Promise<ScanResponse> {
    const address = request.address as Address; // shape guaranteed by supports()
    const client = ctx.chain(Chain.ETHEREUM);

    ctx.signal?.throwIfAborted();

    // Two RPC round-trips total, issued together: one eth_getBalance and one
    // multicall aggregating every balanceOf.
    const [nativeBalance, tokenResults] = await Promise.all([
      client.getBalance({ address }),
      client.multicall({
        allowFailure: true,
        contracts: ETHEREUM_TOKENS.map((token) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address] as const,
        })),
      }),
    ]);

    ctx.signal?.throwIfAborted();

    const claimables: Claimable[] = [];

    if (nativeBalance > 0n) {
      claimables.push(this.toClaimable(address, nativeBalance, null));
    }

    tokenResults.forEach((result, index) => {
      const token = ETHEREUM_TOKENS[index];
      if (!token) return;
      if (result.status !== "success") {
        // One unreadable token must not sink the other reads.
        ctx.logger.warn(
          { token: token.symbol, tokenAddress: token.address, err: result.error },
          "balanceOf failed for token; skipping",
        );
        return;
      }
      const balance = result.result;
      if (typeof balance === "bigint" && balance > 0n) {
        claimables.push(this.toClaimable(address, balance, token));
      }
    });

    ctx.logger.debug(
      { address, found: claimables.length, tokensChecked: ETHEREUM_TOKENS.length },
      "ethereum assets scan complete",
    );

    return {
      connectorId: this.metadata.id,
      address: request.address,
      claimables,
      scannedAt: ctx.now().toISOString(),
    };
  }

  /** Map a balance to the shared Claimable model. `token === null` => native ETH. */
  private toClaimable(owner: Address, balance: bigint, token: TrackedToken | null): Claimable {
    const isNative = token === null;
    return {
      id: `${this.metadata.id}:${owner.toLowerCase()}:${isNative ? "native" : token.address.toLowerCase()}`,
      connectorId: this.metadata.id,
      chain: Chain.ETHEREUM,
      category: ClaimableCategory.OTHER,
      token: isNative
        ? { symbol: "ETH", name: "Ether", decimals: 18, contractAddress: null }
        : {
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            contractAddress: token.address,
          },
      amountRaw: balance.toString(),
      // formatUnits is exact (string math on the bigint) — no float precision loss.
      amountDecimal: formatUnits(balance, isNative ? 18 : token.decimals),
      usdValue: null, // price feeds are out of scope this milestone
      claimUrl: isNative
        ? `${ETHERSCAN}/address/${owner}`
        : `${ETHERSCAN}/token/${token.address}?a=${owner}`,
      contractAddress: isNative ? NATIVE_PLACEHOLDER_CONTRACT : token.address,
      expiresAt: null,
      confidence: Confidence.CONFIRMED,
      riskFlags: [],
    };
  }
}
