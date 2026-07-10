import pino from "pino";

/**
 * Structured JSON logging (pino).
 *
 * Production emits one JSON object per line (machine-parseable, ships to any
 * log aggregator). Development pretty-prints via pino-pretty.
 *
 * Conventions:
 * - Always log objects first, message second: `logger.info({ scanId }, "scan queued")`.
 * - Request-scoped logs must go through a child logger carrying `requestId`
 *   (see lib/api/handler.ts) so every line of a request is correlatable.
 */

const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level,
  base: { service: "claimradar" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }
    : {}),
});

/** Re-exported so consumers depend on our abstraction, not on pino directly. */
export type Logger = pino.Logger;

/** Child logger carrying stable context (requestId, connectorId, …). */
export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
