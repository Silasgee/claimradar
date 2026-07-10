import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * - Loads .env explicitly (Prisma 7 no longer does so implicitly) so CLI
 *   commands like `prisma migrate dev` see DATABASE_URL.
 * - The runtime client gets its connection through the pg driver adapter in
 *   db/client.ts; this file only configures the CLI.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
