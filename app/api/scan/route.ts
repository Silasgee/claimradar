import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createApiHandler } from "@/lib/api/handler";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { createDiscoveryEngine } from "@/lib/discovery";
import { ValidationError } from "@/lib/errors";
import { isValidEvmAddress } from "@/lib/wallet";

/**
 * POST /api/scan — the single MVP scan endpoint.
 *
 * Thin transport over the Discovery Engine: validate input, rate-limit, run
 * discovery, return the canonical report. All business logic stays in the
 * engine; this route adds no claim logic.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const bodySchema = z.object({ address: z.string() });

// Generous enough for real use, tight enough to protect RPC spend.
const SCAN_LIMIT = 20;
const SCAN_WINDOW_MS = 60_000;

export const POST = createApiHandler("scan", async (request: NextRequest, ctx) => {
  const limit = rateLimit(`scan:${clientKey(request)}`, SCAN_LIMIT, SCAN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many scans. Please slow down." } },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError("Request body must be { address: string }");
  }

  const address = parsed.data.address.trim();
  if (!isValidEvmAddress(address)) {
    throw new ValidationError("Enter a valid EVM wallet address (0x + 40 hex characters).");
  }

  const engine = createDiscoveryEngine();
  const report = await engine.discover({ wallet: address }, { signal: request.signal });

  ctx.logger.info(
    { status: report.status, claims: report.claims.length, durationMs: report.durationMs },
    "scan served",
  );
  return NextResponse.json(report);
});
