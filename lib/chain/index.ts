import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";

import { getEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { Chain } from "@/types";

/**
 * Chain Access Layer (blueprint §4.2 #6, §9.2).
 *
 * The ONLY place chain clients are constructed. Connectors never build their
 * own clients — they receive read access via `ctx.chain(chain)`, which routes
 * here. That keeps provider configuration, timeouts, and (future) failover,
 * rate limiting, and per-provider quotas in one seam.
 *
 * Transport policy:
 * - `retryCount: 0` — retries are owned by the ConnectorRuntime, which already
 *   applies backoff + jitter per attempt. Retrying in the transport as well
 *   would multiply attempts (3 transport × 3 runtime = 9 calls).
 * - `timeout` below the runtime's 8s per-attempt deadline, so a dead RPC
 *   surfaces as a retryable error rather than burning the whole attempt.
 */

/** A chain is enabled but has no client configuration (or isn't EVM). */
export class ChainNotConfiguredError extends AppError {
  constructor(chain: string) {
    super(`No chain client configured for "${chain}"`, "CHAIN_NOT_CONFIGURED", 500, true);
  }
}

export interface ChainAccess {
  /** Read-only client for the given chain. @throws ChainNotConfiguredError */
  getClient(chain: Chain): PublicClient;
}

export interface ViemChainAccessConfig {
  /** RPC URL per supported chain. */
  rpcUrls: Partial<Record<Chain, string>>;
  /** Per-request transport timeout (ms). */
  requestTimeoutMs?: number;
}

const VIEM_CHAINS = {
  [Chain.ETHEREUM]: mainnet,
} as const;

export class ViemChainAccess implements ChainAccess {
  private readonly clients = new Map<Chain, PublicClient>();

  constructor(private readonly config: ViemChainAccessConfig) {}

  getClient(chain: Chain): PublicClient {
    const cached = this.clients.get(chain);
    if (cached) return cached;

    const rpcUrl = this.config.rpcUrls[chain];
    const viemChain = chain in VIEM_CHAINS ? VIEM_CHAINS[chain as keyof typeof VIEM_CHAINS] : null;
    if (!rpcUrl || !viemChain) {
      throw new ChainNotConfiguredError(chain);
    }

    const client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl, {
        timeout: this.config.requestTimeoutMs ?? 5_000,
        retryCount: 0,
      }),
    });
    this.clients.set(chain, client);
    return client;
  }
}

/** Chain access wired from validated environment configuration. */
export function createDefaultChainAccess(): ChainAccess {
  const env = getEnv();
  return new ViemChainAccess({
    rpcUrls: { [Chain.ETHEREUM]: env.ETHEREUM_RPC_URL },
  });
}
