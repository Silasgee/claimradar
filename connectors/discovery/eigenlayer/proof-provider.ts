import { getAddress, type Address, type Hex } from "viem";

import type { RewardsMerkleClaim } from "./types";

/**
 * Proof provider seam (Option B).
 *
 * A discovery connector must not know HOW a reward proof is produced — only
 * that it gets a `RewardsMerkleClaim` it can hand to the on-chain
 * `checkClaim`. Today that proof comes from EigenLayer's official sidecar;
 * this interface lets us swap in a locally-generated proof engine later
 * without touching the connector.
 *
 * A provider is UNTRUSTED. Its output is always re-verified on-chain by the
 * connector before anything is surfaced — see eigenlayer-connector.ts.
 */
export interface EigenLayerProofProvider {
  /**
   * The earner's claim against the latest distribution root, or null when the
   * earner has no rewards (the common case — not an error).
   */
  getRewardProof(
    earner: Address,
    opts: { signal?: AbortSignal },
  ): Promise<RewardsMerkleClaim | null>;
  /** Cheap reachability probe for health(). */
  health(opts: { signal?: AbortSignal }): Promise<boolean>;
}

/** Raised for transport-level provider failures (distinct from "no rewards"). */
export class ProofProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProofProviderError";
  }
}

type FetchImpl = typeof fetch;

/** Shape of the sidecar's claim-proof response (mapped into RewardsMerkleClaim). */
interface SidecarClaimResponse {
  claim?: {
    rootIndex: number | string;
    earnerIndex: number | string;
    earnerTreeProof: Hex;
    earnerLeaf: { earner: string; earnerTokenRoot: Hex };
    tokenIndices: Array<number | string>;
    tokenTreeProofs: Hex[];
    tokenLeaves: Array<{ token: string; cumulativeEarnings: string | number }>;
  } | null;
}

/**
 * Reads proofs from EigenLayer's official sidecar (or the officially supported
 * hosted proof service). The base URL is INJECTED — never hardcoded — so it is
 * confirmed per environment at deploy.
 *
 * NOTE (deploy-time): the exact request path and response field names below are
 * written to the sidecar's documented rewards proof API; confirm them against
 * the live sidecar when wiring `EIGENLAYER_SIDECAR_URL`. Because every proof is
 * re-verified on-chain via `checkClaim`, a mismatch here can only ever yield
 * FEWER claims (a rejected/malformed proof is dropped) — never a false one.
 */
export class SidecarProofProvider implements EigenLayerProofProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async getRewardProof(
    earner: Address,
    opts: { signal?: AbortSignal },
  ): Promise<RewardsMerkleClaim | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/rewards/v1/earners/${earner}/claim-proof`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: opts.signal,
      });
    } catch (cause) {
      throw new ProofProviderError("sidecar request failed", { cause });
    }

    // No rewards for this earner is a normal, expected outcome.
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new ProofProviderError(`sidecar returned HTTP ${res.status}`);
    }

    let body: SidecarClaimResponse;
    try {
      body = (await res.json()) as SidecarClaimResponse;
    } catch (cause) {
      throw new ProofProviderError("sidecar returned unparseable JSON", { cause });
    }
    if (!body.claim) return null;
    return normalizeClaim(body.claim);
  }

  async health(opts: { signal?: AbortSignal }): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/health`, {
        signal: opts.signal,
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Map an untrusted sidecar payload into a strongly-typed RewardsMerkleClaim.
 * Throws on structural garbage so the connector treats it as a provider error
 * rather than silently constructing a malformed claim.
 */
function normalizeClaim(claim: NonNullable<SidecarClaimResponse["claim"]>): RewardsMerkleClaim {
  try {
    return {
      rootIndex: Number(claim.rootIndex),
      earnerIndex: Number(claim.earnerIndex),
      earnerTreeProof: claim.earnerTreeProof,
      earnerLeaf: {
        earner: getAddress(claim.earnerLeaf.earner),
        earnerTokenRoot: claim.earnerLeaf.earnerTokenRoot,
      },
      tokenIndices: claim.tokenIndices.map((i) => Number(i)),
      tokenTreeProofs: claim.tokenTreeProofs,
      tokenLeaves: claim.tokenLeaves.map((leaf) => ({
        token: getAddress(leaf.token),
        cumulativeEarnings: BigInt(leaf.cumulativeEarnings),
      })),
    };
  } catch (cause) {
    throw new ProofProviderError("sidecar claim payload was structurally invalid", { cause });
  }
}
