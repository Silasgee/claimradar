import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve "@/…" path aliases from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
