import type { Connector, ConnectorContext } from "@/connectors";
import {
  ConnectorConfigurationError,
  ConnectorError,
  ConnectorExecutionError,
  ConnectorTimeoutError,
} from "@/connectors";
import type { Logger } from "@/lib/logger";
import { ConnectorRunStatus, type ScanRequest, type ScanResponse } from "@/types";

/**
 * Connector Runtime — executes a single connector with full isolation.
 *
 * Guarantees (see docs/SCAN-ENGINE.md):
 * - `execute()` NEVER throws. Every outcome — success, failure, timeout,
 *   cancellation — is returned as a `ConnectorRunResult`. This is the
 *   bulkhead: a failing connector cannot take down a scan.
 * - Every attempt runs under a hard timeout, enforced by a race — a
 *   non-cooperative connector cannot hold the scan hostage. Cooperative
 *   connectors observe the same deadline via `ctx.signal`.
 * - Transient failures are retried with exponential backoff + jitter.
 *   `ConnectorConfigurationError` is permanent and never retried.
 * - Caller cancellation (AbortSignal) is honored between attempts, during
 *   backoff, and mid-attempt.
 */

export interface ConnectorRuntimeOptions {
  /** Hard per-attempt deadline. Blueprint default: 8s. */
  timeoutMs: number;
  /** Additional attempts after the first (2 => up to 3 attempts). */
  maxRetries: number;
  /** Backoff base; attempt n waits ~ base * 2^(n-1), with ±20% jitter. */
  backoffBaseMs: number;
  /** Cap on a single backoff delay. */
  maxBackoffMs: number;
}

export const DEFAULT_RUNTIME_OPTIONS: ConnectorRuntimeOptions = {
  timeoutMs: 8_000,
  maxRetries: 2,
  backoffBaseMs: 250,
  maxBackoffMs: 5_000,
};

/** The isolated outcome of executing one connector for one request. */
export interface ConnectorRunResult {
  connector: Connector;
  status: ConnectorRunStatus;
  attempts: number;
  durationMs: number;
  /** Present iff status is SUCCESS. */
  response?: ScanResponse;
  /** Present iff status is FAILED or TIMEOUT. */
  error?: ConnectorError;
}

/** Internal sentinel for caller-initiated cancellation. Never leaves the runtime. */
class RunCancelledError extends Error {
  constructor() {
    super("Connector run cancelled");
    this.name = "RunCancelledError";
  }
}

/** Sleep that rejects with RunCancelledError as soon as the signal aborts. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RunCancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class ConnectorRuntime {
  private readonly options: ConnectorRuntimeOptions;

  constructor(options: Partial<ConnectorRuntimeOptions> = {}) {
    this.options = { ...DEFAULT_RUNTIME_OPTIONS, ...options };
  }

  /**
   * Execute one connector for one request. Never throws.
   *
   * @param ctx Base connector context (without signal — the runtime injects a
   *            per-attempt signal combining the caller's signal and the
   *            attempt timeout).
   */
  async execute(
    connector: Connector,
    request: ScanRequest,
    ctx: Omit<ConnectorContext, "signal">,
    opts: { signal?: AbortSignal } & Partial<ConnectorRuntimeOptions> = {},
  ): Promise<ConnectorRunResult> {
    const cfg = { ...this.options, ...opts };
    const { signal } = opts;
    const connectorId = connector.metadata.id;
    const log: Logger = ctx.logger;
    const startedAt = performance.now();
    const done = (partial: Omit<ConnectorRunResult, "connector" | "durationMs">) => ({
      connector,
      durationMs: Math.round(performance.now() - startedAt),
      ...partial,
    });

    let attempts = 0;
    while (true) {
      if (signal?.aborted) {
        return done({ status: ConnectorRunStatus.CANCELLED, attempts: Math.max(attempts, 1) });
      }
      attempts++;

      try {
        const response = await this.runAttempt(connector, request, ctx, cfg.timeoutMs, signal);
        return done({ status: ConnectorRunStatus.SUCCESS, attempts, response });
      } catch (error) {
        if (error instanceof RunCancelledError) {
          return done({ status: ConnectorRunStatus.CANCELLED, attempts });
        }

        const connectorError = toConnectorError(connectorId, error);
        const timedOut = connectorError instanceof ConnectorTimeoutError;
        const canRetry = isRetryable(connectorError) && attempts <= cfg.maxRetries;

        if (!canRetry) {
          log.warn(
            { connectorId, attempts, code: connectorError.code, err: connectorError },
            "connector run failed",
          );
          return done({
            status: timedOut ? ConnectorRunStatus.TIMEOUT : ConnectorRunStatus.FAILED,
            attempts,
            error: connectorError,
          });
        }

        const delay = backoffDelay(cfg, attempts);
        log.debug(
          { connectorId, attempt: attempts, retryInMs: delay, code: connectorError.code },
          "connector attempt failed, retrying",
        );
        try {
          await abortableSleep(delay, signal);
        } catch {
          return done({ status: ConnectorRunStatus.CANCELLED, attempts });
        }
      }
    }
  }

  /**
   * One attempt under a hard deadline. The timeout is enforced by racing the
   * connector against the combined (caller + timeout) signal, so even a
   * connector that ignores `ctx.signal` cannot block the scan.
   */
  private async runAttempt(
    connector: Connector,
    request: ScanRequest,
    ctx: Omit<ConnectorContext, "signal">,
    timeoutMs: number,
    callerSignal?: AbortSignal,
  ): Promise<ScanResponse> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

    const scanPromise = Promise.resolve(connector.scan({ ...ctx, signal: combined }, request));
    // If the race is lost, the connector may still settle later; mark its
    // rejection as handled so it can't surface as an unhandled rejection.
    scanPromise.catch(() => {});

    const abortGuard = new Promise<never>((_, reject) => {
      const onAbort = () => {
        reject(
          callerSignal?.aborted
            ? new RunCancelledError()
            : new ConnectorTimeoutError(connector.metadata.id, timeoutMs),
        );
      };
      if (combined.aborted) {
        onAbort();
        return;
      }
      combined.addEventListener("abort", onAbort, { once: true });
    });

    return Promise.race([scanPromise, abortGuard]);
  }
}

/** Configuration problems are permanent; everything else is assumed transient. */
function isRetryable(error: ConnectorError): boolean {
  return !(error instanceof ConnectorConfigurationError);
}

function toConnectorError(connectorId: string, error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  const message = error instanceof Error ? error.message : "Unknown connector failure";
  return new ConnectorExecutionError(connectorId, message, { cause: error });
}

function backoffDelay(cfg: ConnectorRuntimeOptions, attempt: number): number {
  const exponential = cfg.backoffBaseMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, cfg.maxBackoffMs);
  const jitter = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  return Math.max(0, Math.round(capped * jitter));
}
