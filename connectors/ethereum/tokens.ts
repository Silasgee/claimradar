import type { Address } from "viem";

/**
 * Curated ERC-20 set for the Ethereum assets connector.
 *
 * A bounded, known set is deliberate (blueprint ADR-1): a fixed list of
 * contracts is answerable with ONE multicall round-trip of `balanceOf` reads.
 * Discovering *every* token an address holds requires an indexer and belongs
 * to a future indexer-backed connector, not this on-chain one.
 *
 * Metadata (symbol/name/decimals) is pinned as constants: these values are
 * immutable in practice for majors, and pinning them avoids 3 extra RPC calls
 * per token per scan.
 */

export interface TrackedToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export const ETHEREUM_TOKENS: readonly TrackedToken[] = [
  {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
  },
  {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
  },
  {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
  },
  {
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    symbol: "LINK",
    name: "ChainLink Token",
    decimals: 18,
  },
  {
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
  },
  {
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    symbol: "AAVE",
    name: "Aave Token",
    decimals: 18,
  },
] as const;
