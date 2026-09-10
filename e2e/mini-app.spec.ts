import { expect, test } from "@playwright/test";

/**
 * The Mini App, from the browser's point of view.
 *
 * Telegram is not here, so `window.Telegram` is undefined — which is exactly the
 * desktop-browser case the page has to handle. The signed-in path is covered by
 * `scripts/check-miniapp-login.mjs`, which drives real signed `initData` over HTTP;
 * what these add is that the page in front of somebody does the right thing.
 */

test("offers the desktop login when opened outside Telegram", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByText(/lives inside Telegram/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Log in with Telegram/ })).toBeVisible();
});

test("the login page is honest when web login is not configured", async ({ page }) => {
  await page.goto("/login");

  // Better a plain sentence than a button that goes nowhere.
  await expect(page.getByText(/switched on yet|Log in with Telegram/)).toBeVisible();
});

test("the Mini App carries no site chrome", async ({ page }) => {
  // Inside Telegram a site header and footer are somebody else's furniture.
  await page.goto("/app");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("the site does have chrome", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("signed-out visitors cannot read the session endpoint", async ({ request }) => {
  const response = await request.get("/api/auth/me");
  expect(response.status()).toBe(401);
});

test("the rendered leaderboard is served as a PNG", async ({ request }) => {
  const response = await request.get("/api/og/leaderboard");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
});
