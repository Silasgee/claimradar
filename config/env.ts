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
  /** PostgreSQL connection string (consumed by Prisma). */
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a valid PostgreSQL URL" }),
  /** Redis connection string (consumed by the cache layer). */
  REDIS_URL: z.url({ message: "REDIS_URL must be a valid Redis URL" }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validate and return the environment. Throws with a human-readable list of
 * every missing/invalid variable.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
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
