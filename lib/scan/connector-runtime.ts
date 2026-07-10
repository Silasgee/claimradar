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
 * Connector Runtime — isolated execution primitive shared by the Scan Engine
 * and the Discovery Engine.
 *
 * Guarantees (see docs/SCAN-ENGINE.md):
 * - `runIsolated()` / `execute()` NEVER throw. Every outcome — success,
 *   failure, timeout, cancellation — is returned as a result value. This is
 *   the bulkhead: a failing unit of work cannot take down its caller.
 * - Every attempt runs under a hard timeout, enforced by a race — a
 *   non-cooperative task cannot hold the caller hostage. Cooperative tasks
 *   observe the same deadline via the injected signal.
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

export type RunOptions = { signal?: AbortSignal } & Partial<ConnectorRuntimeOptions>;

/** The isolated outcome of one unit of work. */
export interface IsolatedRunResult<T> {
  status: ConnectorRunStatus;
  attempts: number;
  durationMs: number;
  /** Present iff status is SUCCESS. */
  value?: T;
  /** Present iff status is FAILED or TIMEOUT. */
  error?: ConnectorError;
}

/** The isolated outcome of executing one Scan-Engine connector. */
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
    super("Run cancelled");
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
   * Execute an arbitrary async unit of work with full isolation. Never throws.
   *
   * @param taskId  Identifier for logs and error attribution (connector id).
   * @param fn      The work. Receives a combined (caller + timeout) signal so
   *                cooperative tasks can stop early.
   * @param logger  Logger for retry/failure diagnostics.
   */
  async runIsolated<T>(
    taskId: string,
    fn: (signal: AbortSignal) => Promise<T> | T,
    logger: Logger,
    opts: RunOptions = {},
  ): Promise<IsolatedRunResult<T>> {
    const cfg = { ...this.options, ...opts };
    const { signal } = opts;
    const startedAt = performance.now();
    const done = (partial: Omit<IsolatedRunResult<T>, "durationMs">): IsolatedRunResult<T> => ({
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
        const value = await this.runAttempt(taskId, fn, cfg.timeoutMs, signal);
        return done({ status: ConnectorRunStatus.SUCCESS, attempts, value });
      } catch (error) {
        if (error instanceof RunCancelledError) {
          return done({ status: ConnectorRunStatus.CANCELLED, attempts });
        }
        // A cooperative task may surface signal aborts as AbortError before
        // our race guard settles — classify by cause.
        if (isAbortError(error)) {
          if (signal?.aborted) {
            return done({ status: ConnectorRunStatus.CANCELLED, attempts });
          }
          error = new ConnectorTimeoutError(taskId, cfg.timeoutMs, { cause: error });
        }

        const connectorError = toConnectorError(taskId, error);
        const timedOut = connectorError instanceof ConnectorTimeoutError;
        const canRetry = isRetryable(connectorError) && attempts <= cfg.maxRetries;

        if (!canRetry) {
          logger.warn(
            { connectorId: taskId, attempts, code: connectorError.code, err: connectorError },
            "isolated run failed",
          );
          return done({
            status: timedOut ? ConnectorRunStatus.TIMEOUT : ConnectorRunStatus.FAILED,
            attempts,
            error: connectorError,
          });
        }

        const delay = backoffDelay(cfg, attempts);
        logger.debug(
          { connectorId: taskId, attempt: attempts, retryInMs: delay, code: connectorError.code },
          "isolated run attempt failed, retrying",
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
   * Execute one Scan-Engine connector for one request. Never throws.
   * Thin wrapper over {@link runIsolated}.
   *
   * @param ctx Base connector context (without signal — the runtime injects a
   *            per-attempt signal combining the caller's signal and the
   *            attempt timeout).
   */
  async execute(
    connector: Connector,
    request: ScanRequest,
    ctx: Omit<ConnectorContext, "signal">,
    opts: RunOptions = {},
  ): Promise<ConnectorRunResult> {
    const result = await this.runIsolated<ScanResponse>(
      connector.metadata.id,
      (signal) => connector.scan({ ...ctx, signal }, request),
      ctx.logger,
      opts,
    );
    return {
      connector,
      status: result.status,
      attempts: result.attempts,
      durationMs: result.durationMs,
      ...(result.value !== undefined ? { response: result.value } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }

  /**
   * One attempt under a hard deadline. The timeout is enforced by racing the
   * work against the combined (caller + timeout) signal, so even a task that
   * ignores the signal cannot block the caller.
   */
  private async runAttempt<T>(
    taskId: string,
    fn: (signal: AbortSignal) => Promise<T> | T,
    timeoutMs: number,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

    const workPromise = Promise.resolve(fn(combined));
    // If the race is lost, the work may still settle later; mark its rejection
    // as handled so it can't surface as an unhandled rejection.
    workPromise.catch(() => {});

    const abortGuard = new Promise<never>((_, reject) => {
      const onAbort = () => {
        reject(
          callerSignal?.aborted
            ? new RunCancelledError()
            : new ConnectorTimeoutError(taskId, timeoutMs),
        );
      };
      if (combined.aborted) {
        onAbort();
        return;
      }
      combined.addEventListener("abort", onAbort, { once: true });
    });

    return Promise.race([workPromise, abortGuard]);
  }
}

/** Configuration problems are permanent; everything else is assumed transient. */
function isRetryable(error: ConnectorError): boolean {
  return !(error instanceof ConnectorConfigurationError);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function toConnectorError(taskId: string, error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  const message = error instanceof Error ? error.message : "Unknown failure";
  return new ConnectorExecutionError(taskId, message, { cause: error });
}

function backoffDelay(cfg: ConnectorRuntimeOptions, attempt: number): number {
  const exponential = cfg.backoffBaseMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, cfg.maxBackoffMs);
  const jitter = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  return Math.max(0, Math.round(capped * jitter));
}
