import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@/config/env";
import { PrismaClient } from "@/db/generated/prisma/client";
import { DatabaseError } from "@/lib/errors";

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
    const connectionString = getEnv().DATABASE_URL;
    if (!connectionString) {
      // DATABASE_URL is optional in Phase 1 because nothing persists yet.
      // Any future feature that reaches the database fails loudly here.
      throw new DatabaseError(
        "DATABASE_URL is not configured. Set it before using database-backed features.",
      );
    }
    const adapter = new PrismaPg({ connectionString });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
