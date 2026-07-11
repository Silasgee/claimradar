import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve "@/…" path aliases from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    // Backend tests run in node; component tests opt into jsdom per-file via
    // a `// @vitest-environment jsdom` docblock. `globals` lets Testing
    // Library auto-register its afterEach DOM cleanup.
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
