import { NextResponse } from "next/server";

import { getEnv } from "@/config/env";
import { createApiHandler } from "@/lib/api/handler";
import { scanMetrics } from "@/lib/scan";

/**
 * Internal-only metrics snapshot (scan + connector counters and durations).
 *
 * Not part of the public API surface:
 * - outside production it is always served (local/dev/preview debugging);
 * - in production it responds 404 unless INTERNAL_METRICS_ENABLED=true, and
 *   deployments must network-restrict /api/internal/* regardless (blueprint
 *   §16 — internal metrics are network-restricted, not authenticated).
 */

export const dynamic = "force-dynamic";

export const GET = createApiHandler("internal-metrics", async () => {
  const env = getEnv();
  if (env.NODE_ENV === "production" && !env.INTERNAL_METRICS_ENABLED) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    ...scanMetrics.snapshot(),
  });
});
