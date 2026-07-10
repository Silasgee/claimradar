import type { Connector, ConnectorContext, ConnectorMetadata } from "@/connectors";
import { InMemoryCacheStore } from "@/lib/cache";
import { createLogger, type Logger } from "@/lib/logger";
import {
  Chain,
  ClaimableCategory,
  Confidence,
  type Claimable,
  type ScanRequest,
  type ScanResponse,
} from "@/types";

/** Silent logger for tests. */
export function createTestLogger(): Logger {
  const logger = createLogger({ test: true });
  logger.level = "silent";
  return logger;
}

/** Deterministic connector context: fixed clock, in-memory cache, silent logs. */
export function createTestContext(
  overrides: Partial<Pick<ConnectorContext, "chain" | "config">> = {},
): Omit<ConnectorContext, "signal"> {
  return {
    logger: createTestLogger(),
    cache: new InMemoryCacheStore(),
    config: overrides.config ?? {},
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    // Tests that exercise chain access must stub this explicitly.
    chain:
      overrides.chain ??
      (() => {
        throw new Error("ctx.chain is not stubbed in this test");
      }),
  };
}

/** A structurally valid claimable with overridable fields. */
export function makeClaimable(overrides: Partial<Claimable> = {}): Claimable {
  return {
    id: "stub:claimable:1",
    connectorId: "stub",
    chain: Chain.ETHEREUM,
    category: ClaimableCategory.AIRDROP,
    token: { symbol: "TEST", name: "Test Token", decimals: 18, contractAddress: null },
    amountRaw: "1000000000000000000",
    amountDecimal: "1.0",
    usdValue: null,
    claimUrl: "https://claims.example.com/test",
    contractAddress: "0x0000000000000000000000000000000000000042",
    expiresAt: null,
    confidence: Confidence.CONFIRMED,
    riskFlags: [],
    ...overrides,
  };
}

export interface StubBehavior {
  id: string;
  version?: string;
  chains?: Chain[];
  /** Simulated work duration per attempt. */
  delayMs?: number;
  /** Fail this many attempts before succeeding. Infinity = always fail. */
  failTimes?: number;
  /** Error factory for failures (default: a generic Error). */
  failWith?: () => Error;
  /** Claimables to return on success (already-built objects, returned as-is). */
  claimables?: unknown[];
  /** supports() result (default true). */
  supports?: boolean;
  /** If true, scan() rejects promptly when ctx.signal aborts (cooperative). */
  honorSignal?: boolean;
}

/**
 * Configurable stand-in connector for orchestration tests. Tracks attempt
 * count so retry behavior can be asserted.
 */
export class StubConnector implements Connector {
  readonly metadata: ConnectorMetadata;
  calls = 0;

  constructor(private readonly behavior: StubBehavior) {
    this.metadata = {
      id: behavior.id,
      displayName: `Stub ${behavior.id}`,
      version: behavior.version ?? "1.0.0",
      category: ClaimableCategory.AIRDROP,
      chains: behavior.chains ?? [Chain.ETHEREUM],
    };
  }

  supports(): boolean {
    return this.behavior.supports ?? true;
  }

  async scan(ctx: ConnectorContext, request: ScanRequest): Promise<ScanResponse> {
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

    return {
      connectorId: this.metadata.id,
      address: request.address,
      claimables: (this.behavior.claimables ?? []) as ScanResponse["claimables"],
      scannedAt: ctx.now().toISOString(),
    };
  }
}

export const TEST_ADDRESS = "0x000000000000000000000000000000000000beef";

export const testRequest: ScanRequest = { address: TEST_ADDRESS };
