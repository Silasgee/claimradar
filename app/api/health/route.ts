import { NextResponse } from "next/server";

import { createApiHandler } from "@/lib/api/handler";
import pkg from "@/package.json";

/**
 * Liveness endpoint.
 *
 * Deliberately dependency-free: it reports that the process is up, not that
 * Postgres/Redis are reachable. Dependency-aware readiness checks arrive with
 * the scan pipeline in a later milestone.
 */

// Must never be statically prerendered — uptime and timestamp are live values.
export const dynamic = "force-dynamic";

export const GET = createApiHandler("health", async () => {
  return NextResponse.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    version: pkg.version,
    timestamp: new Date().toISOString(),
  });
});
