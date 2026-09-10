import { defineConfig } from "vitest/config";
import path from "path";

/**
 * The database-backed suite.
 *
 * Separate from the main config for two reasons. It needs a live Postgres, so it
 * cannot run in a fresh clone and has no business in `pnpm verify`. And every file
 * resets the database in `beforeAll`, so the files cannot run in parallel — two
 * suites truncating the same tables at once would produce failures that look like
 * real bugs and never reproduce.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts", "./test/db/setup.ts"],
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/e2e/**"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/shims/server-only.ts"),
    },
  },
});
