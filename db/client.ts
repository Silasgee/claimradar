import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@/config/env";
import { PrismaClient } from "@/db/generated/prisma/client";

/**
 * Prisma client (lazy singleton) using the Prisma 7 pg driver adapter.
 *
 * `globalThis` caching prevents Next.js dev-mode hot reloads from exhausting
 * the database connection pool with new clients.
 *
 * Import `getDb()` from this module only — never instantiate PrismaClient
 * elsewhere.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
