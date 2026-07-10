import { NextResponse, type NextRequest } from "next/server";

import { toAppError } from "@/lib/errors";
import { createLogger, type Logger } from "@/lib/logger";

/**
 * API route wrapper providing, for every request:
 * - a request id (honors an incoming `x-request-id`, else generates one),
 * - a request-scoped structured logger,
 * - duration + status logging on completion,
 * - centralized AppError → HTTP mapping (unknown errors become opaque 500s).
 *
 * All route handlers must be defined through this wrapper so logging and
 * error semantics stay uniform across the API surface.
 */

export interface RequestContext {
  requestId: string;
  logger: Logger;
}

type RouteHandler = (request: NextRequest, ctx: RequestContext) => Promise<NextResponse>;

export function createApiHandler(routeName: string, handler: RouteHandler) {
  return async function wrappedHandler(request: NextRequest): Promise<NextResponse> {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const log = createLogger({ requestId, route: routeName });
    const startedAt = performance.now();

    log.info({ method: request.method, url: request.nextUrl.pathname }, "request started");

    let response: NextResponse;
    try {
      response = await handler(request, { requestId, logger: log });
    } catch (error) {
      const appError = toAppError(error);
      // Operational errors are expected (bad input, upstream down); anything
      // else is a bug and gets the full error object in the log.
      if (appError.isOperational) {
        log.warn({ code: appError.code, err: appError }, appError.message);
      } else {
        log.error({ code: appError.code, err: appError }, appError.message);
      }
      response = NextResponse.json(
        { error: appError.toJSON(), requestId },
        { status: appError.statusCode },
      );
    }

    response.headers.set("x-request-id", requestId);
    const durationMs = Math.round(performance.now() - startedAt);
    log.info({ status: response.status, durationMs }, "request completed");
    return response;
  };
}
