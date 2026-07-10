/**
 * Centralized, typed application errors.
 *
 * Every error the platform raises intentionally should extend `AppError`.
 * The API layer maps `AppError`s to HTTP responses; anything else is treated
 * as an unexpected bug and surfaced as a 500 without leaking internals.
 *
 * To add a new error type: extend `AppError`, pick a stable `code` (SCREAMING_SNAKE,
 * never reused) and a default HTTP status.
 */

export interface AppErrorOptions {
  /** Machine-readable detail safe to expose to API clients. */
  details?: Record<string, unknown>;
  /** Underlying cause, preserved for logs but never exposed to clients. */
  cause?: unknown;
}

export abstract class AppError extends Error {
  /** Stable, machine-readable error code (e.g. "VALIDATION_ERROR"). */
  readonly code: string;
  /** HTTP status the API layer should respond with. */
  readonly statusCode: number;
  /** Operational errors are expected failures (bad input, upstream down) — log
   * them as warnings, not bugs. */
  readonly isOperational: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational = true,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }

  /**
   * Serializable shape for API responses (RFC 9457-style, no internals).
   *
   * Non-operational errors are redacted: their `message` often originates
   * from an unknown throwable (driver errors, file paths, connection
   * strings) and must never reach a client. The full message still goes to
   * the logs — see lib/api/handler.ts.
   */
  toJSON(): Record<string, unknown> {
    if (!this.isOperational) {
      return { code: this.code, message: "Internal server error" };
    }
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Client sent malformed or invalid input. */
export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, "VALIDATION_ERROR", 400, true, options);
  }
}

/** A database operation failed. */
export class DatabaseError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, "DATABASE_ERROR", 500, true, options);
  }
}

/** An upstream dependency (RPC, indexer, third-party API) failed. */
export class ExternalServiceError extends AppError {
  /** Name of the failing service, for logs and metrics. */
  readonly service: string;

  constructor(service: string, message: string, options: AppErrorOptions = {}) {
    super(message, "EXTERNAL_SERVICE_ERROR", 502, true, {
      ...options,
      details: { service, ...options.details },
    });
    this.service = service;
  }
}

/** Unexpected failure — a bug. Also the safe fallback for unknown throwables. */
export class InternalServerError extends AppError {
  constructor(message = "Internal server error", options: AppErrorOptions = {}) {
    super(message, "INTERNAL_SERVER_ERROR", 500, false, options);
  }
}

/** Narrowing helper. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalize any thrown value into an AppError so upper layers only ever
 * handle one error shape.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  const message = error instanceof Error ? error.message : "Unknown error";
  return new InternalServerError(message, { cause: error });
}
