import { defineConfig } from "vitest/config";

// Two projects — worker (existing fast unit tests) + frontend (Playwright
// scene smokes). Running `vitest run` runs both; filter with
// --project worker or --project frontend.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          include: ["worker/tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "frontend",
          include: ["test/frontend/**/*.test.ts"],
          // Playwright startup + per-test navigation takes time; the default
          // 5s is too tight for scene smokes that wait for typewriters etc.
          testTimeout: 30000,
          hookTimeout: 30000,
          // Tests share a browser via ref-counting in harness.ts. Running
          // in-parallel over one browser is fine; across many workers it's
          // redundant (each worker launches its own chromium).
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
