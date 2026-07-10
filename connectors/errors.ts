import { AppError, type AppErrorOptions } from "@/lib/errors";

/**
 * Connector error hierarchy.
 *
 * All connector failures extend `ConnectorError` so the scan orchestrator can
 * treat "a connector failed" uniformly (record it, degrade gracefully, never
 * fail the whole scan) while still distinguishing failure modes.
 */
export class ConnectorError extends AppError {
  /** Which connector failed — required for observability and partial results. */
  readonly connectorId: string;

  constructor(
    connectorId: string,
    message: string,
    code = "CONNECTOR_ERROR",
    statusCode = 502,
    options: AppErrorOptions = {},
  ) {
    super(message, code, statusCode, true, {
      ...options,
      details: { connectorId, ...options.details },
    });
    this.connectorId = connectorId;
  }
}

/** Requested connector id is not registered. */
export class ConnectorNotFoundError extends ConnectorError {
  constructor(connectorId: string, options: AppErrorOptions = {}) {
    super(
      connectorId,
      `Connector "${connectorId}" is not registered`,
      "CONNECTOR_NOT_FOUND",
      404,
      options,
    );
  }
}

/** Connector is misconfigured (missing config, bad metadata, duplicate id). */
export class ConnectorConfigurationError extends ConnectorError {
  constructor(connectorId: string, message: string, options: AppErrorOptions = {}) {
    super(connectorId, message, "CONNECTOR_CONFIGURATION_ERROR", 500, options);
  }
}

/** Connector exceeded its execution deadline. */
export class ConnectorTimeoutError extends ConnectorError {
  constructor(connectorId: string, timeoutMs: number, options: AppErrorOptions = {}) {
    super(
      connectorId,
      `Connector "${connectorId}" timed out after ${timeoutMs}ms`,
      "CONNECTOR_TIMEOUT",
      504,
      {
        ...options,
        details: { timeoutMs, ...options.details },
      },
    );
  }
}

/** Connector threw while executing a scan. */
export class ConnectorExecutionError extends ConnectorError {
  constructor(connectorId: string, message: string, options: AppErrorOptions = {}) {
    super(connectorId, message, "CONNECTOR_EXECUTION_ERROR", 502, options);
  }
}
