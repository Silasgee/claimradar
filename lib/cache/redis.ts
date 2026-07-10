import Redis from "ioredis";

import { getEnv } from "@/config/env";
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
    const client = new Redis(getEnv().REDIS_URL, {
      // Fail fast instead of buffering commands forever when Redis is down.
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    client.on("error", (err) => logger.error({ err }, "redis connection error"));
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}
