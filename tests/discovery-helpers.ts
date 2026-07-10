import type { DiscoveryConnector, DiscoveryContext } from "@/lib/discovery";
import type { ConnectorCapabilities, HealthStatus } from "@/lib/discovery";
import { InMemoryCacheStore } from "@/lib/cache";
import {
  Chain,
  ClaimableCategory,
  ClaimStatus,
  Confidence,
  type Claim,
  type DiscoveryRequest,
  type DiscoveryResult,
} from "@/types";

import { createTestLogger } from "./helpers";

/** Deterministic discovery context: fixed clock, in-memory cache, silent logs. */
export function createDiscoveryTestContext(
  overrides: Partial<Pick<DiscoveryContext, "chain" | "config">> = {},
): Omit<DiscoveryContext, "signal"> {
  return {
    logger: createTestLogger(),
    cache: new InMemoryCacheStore(),
    config: overrides.config ?? {},
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    chain:
      overrides.chain ??
      (() => {
        throw new Error("ctx.chain is not stubbed in this test");
      }),
  };
}

/** A structurally valid canonical Claim with overridable fields. */
export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  const base: Claim = {
    id: "claim_v1_placeholder",
    wallet: "0x000000000000000000000000000000000000beef",
    chain: Chain.ETHEREUM,
    protocol: { id: "stub-protocol", name: "Stub Protocol", priority: 50 },
    category: ClaimableCategory.AIRDROP,
    claimType: "merkle-airdrop",
    status: ClaimStatus.CLAIMABLE,
    token: { symbol: "STUB", name: "Stub Token", decimals: 18, contractAddress: null },
    amountRaw: "1000000000000000000",
    amountDecimal: "1.0",
    usdValue: null,
    gasEstimate: null,
    confidence: Confidence.CONFIRMED,
    riskFlags: [],
    claimUrl: "https://claims.example.org/stub",
    expiresAt: null,
    provenance: {
      connectorId: "stub",
      connectorVersion: "1.0.0",
      source: "onchain",
      chain: Chain.ETHEREUM,
      contractAddress: "0x00000000000000000000000000000000000000ff",
      method: "isClaimed(uint256)",
      blockNumber: null,
      discoveredAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: {},
  };
  return { ...base, ...overrides };
}

export interface StubDiscoveryBehavior {
  id: string;
  protocolId?: string;
  priority?: number;
  version?: string;
  chains?: Chain[];
  delayMs?: number;
  /** Fail this many attempts before succeeding. Infinity = always fail. */
  failTimes?: number;
  failWith?: () => Error;
  /** Raw claims to return on success (passed through as-is for validation tests). */
  claims?: unknown[];
  honorSignal?: boolean;
  trustedDomains?: string[];
  supportedChainsThrows?: boolean;
}

/** Configurable stand-in discovery connector for engine tests. */
export class StubDiscoveryConnector implements DiscoveryConnector {
  readonly metadata: DiscoveryConnector["metadata"];
  readonly version: string;
  readonly priority: number;
  calls = 0;

  constructor(private readonly behavior: StubDiscoveryBehavior) {
    this.version = behavior.version ?? "1.0.0";
    this.priority = behavior.priority ?? 50;
    this.metadata = {
      id: behavior.id,
      displayName: `Stub ${behavior.id}`,
      protocol: { id: behavior.protocolId ?? behavior.id, name: `Protocol ${behavior.id}` },
    };
  }

  supportedChains(): Chain[] {
    if (this.behavior.supportedChainsThrows) throw new Error("supportedChains exploded");
    return this.behavior.chains ?? [Chain.ETHEREUM];
  }

  capabilities(): ConnectorCapabilities {
    return {
      accessMode: "onchain",
      categories: [ClaimableCategory.AIRDROP],
      gasEstimation: false,
      trustedDomains: this.behavior.trustedDomains ?? ["claims.example.org"],
    };
  }

  async health(): Promise<HealthStatus> {
    return { healthy: true };
  }

  async discover(ctx: DiscoveryContext, request: DiscoveryRequest): Promise<DiscoveryResult> {
    this.calls++;

    const { delayMs, honorSignal } = this.behavior;
    if (delayMs && delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        if (honorSignal && ctx.signal) {
          ctx.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted by signal"));
            },
            { once: true },
          );
        }
      });
    }

    const failTimes = this.behavior.failTimes ?? 0;
    if (this.calls <= failTimes) {
      throw this.behavior.failWith?.() ?? new Error(`${this.metadata.id} failed`);
    }

    void request;
    return { claims: (this.behavior.claims ?? []) as Claim[] };
  }
}
