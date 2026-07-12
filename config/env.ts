import { z } from "zod";

/**
 * Environment configuration — the ONLY place `process.env` is read.
 *
 * Validated with zod at server startup (see instrumentation.ts) so a
 * misconfigured deployment fails fast with a precise message instead of
 * failing mysteriously at first use.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * PostgreSQL connection string (consumed by Prisma).
   *
   * OPTIONAL in Phase 1: nothing on the MVP request path persists to the
   * database (scans are stateless; history is client-local). It becomes
   * required the day report persistence ships — `getDb()` fails with a clear
   * error if called without it.
   */
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a valid PostgreSQL URL" }).optional(),
  /**
   * Redis connection string (consumed by the cache layer).
   *
   * OPTIONAL in Phase 1: no production connector uses ctx.cache yet and the
   * client is lazy, so Redis is never contacted. Becomes required when
   * connector/report caching is enabled — `getRedis()` fails with a clear
   * error if called without it.
   */
  REDIS_URL: z.url({ message: "REDIS_URL must be a valid Redis URL" }).optional(),
  /**
   * Canonical public URL of the deployment (used for metadataBase / Open
   * Graph / canonical links). Set this once a real production domain exists.
   * When unset on Vercel it is derived from the deployment's own URL (see
   * `resolveSiteUrl`) so share previews never point at a domain we don't
   * serve; elsewhere it falls back to localhost for development.
   */
  SITE_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /**
   * Ethereum mainnet RPC endpoint. The public default is fine for local
   * development; production must use a dedicated provider (Alchemy/Infura)
   * with its own key.
   */
  ETHEREUM_RPC_URL: z.url().default("https://cloudflare-eth.com"),
  /**
   * EigenLayer rewards connector (Phase 2) — all OPTIONAL. When any is unset
   * the connector is inert (discovers nothing) rather than failing, so the
   * platform runs without EigenLayer configured. Injected into the connector
   * via `ctx.config`; nothing is hardcoded in connector code.
   *
   * - EIGENLAYER_REWARDS_COORDINATOR: the RewardsCoordinator proxy address
   *   (mainnet: 0x7750d328b314EfFa365A0402CcfD489B80B0adda).
   * - EIGENLAYER_SIDECAR_URL: base URL of the official EigenLayer sidecar /
   *   proof service that serves reward proofs.
   * - EIGENLAYER_CLAIM_URL: the official claim page shown to users.
   */
  EIGENLAYER_REWARDS_COORDINATOR: z.string().optional(),
  EIGENLAYER_SIDECAR_URL: z.url().optional(),
  EIGENLAYER_CLAIM_URL: z.url().optional(),
  /**
   * Serve /api/internal/metrics in production. Off by default — in deployed
   * environments the internal API must additionally be network-restricted.
   * Always served outside production.
   */
  INTERNAL_METRICS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * The canonical site URL must always be a URL this deployment actually
 * serves — Open Graph images and canonical links break silently (degraded
 * WhatsApp/iMessage previews, SEO pointing at a foreign domain) when it
 * isn't. Explicit SITE_URL wins; otherwise Vercel's injected production /
 * deployment hostname is used, so no dashboard configuration is required.
 */
function resolveSiteUrl(source: NodeJS.ProcessEnv): string | undefined {
  if (source.SITE_URL) return source.SITE_URL;
  const vercelHost = source.VERCEL_PROJECT_PRODUCTION_URL ?? source.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}

/**
 * Validate and return the environment. Throws with a human-readable list of
 * every missing/invalid variable.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse({ ...source, SITE_URL: resolveSiteUrl(source) });
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${problems}\n` +
        `Hint: copy .env.example to .env and fill in the values.`,
    );
  }
  cached = result.data;
  return result.data;
}

/** Lazily validated accessor for use anywhere after startup. */
export function getEnv(): Env {
  return cached ?? validateEnv();
}
