/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Fail fast on misconfiguration before serving any traffic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/config/env");
    validateEnv();
  }
}
