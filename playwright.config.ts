import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a real browser, on a production build.
 *
 * The production build is not an optimisation here, it is a correctness requirement.
 * `next dev` inside a git worktree serves pages that never hydrate — client chunks
 * come back 200, React boots, and no client component ever executes, with no error
 * anywhere. Every server-rendered assertion passes and every interactive one fails,
 * which reads exactly like an app bug and is not one. `next start` has none of it.
 *
 * It also sidesteps a second trap: Next 16 refuses to run a second `next dev` in the
 * same directory whatever port it is given, so a dev server left running from
 * ordinary work would stop the suite dead.
 *
 * Port 3100 rather than 3000 so it never collides with day-to-day work. Chromium plus
 * a phone viewport, because a phone in the dark is the real viewing context.
 */
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: `pnpm build && pnpm next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    // A cold build plus a start; generous because CI machines are not laptops.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
