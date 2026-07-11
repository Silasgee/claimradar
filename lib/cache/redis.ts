import Redis from "ioredis";

import { getEnv } from "@/config/env";
import { ExternalServiceError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Shared ioredis client (lazy singleton).
 *
 * `globalThis` caching survives Next.js dev-mode hot reloads, preventing a
 * new connection per reload — the same pattern as the Prisma client.
 */

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const redisUrl = getEnv().REDIS_URL;
    if (!redisUrl) {
      // REDIS_URL is optional in Phase 1 because nothing on the MVP request
      // path uses the cache. Any future cache consumer fails loudly here and
      // is contained by the connector runtime's error isolation.
      throw new ExternalServiceError(
        "redis",
        "REDIS_URL is not configured. Set it before using cache-backed features.",
      );
    }
    const client = new Redis(redisUrl, {
      // Fail fast instead of buffering commands forever when Redis is down.
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    client.on("error", (err) => logger.error({ err }, "redis connection error"));
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}
