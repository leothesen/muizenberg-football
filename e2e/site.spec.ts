import { expect, test } from "@playwright/test";

/**
 * The public website, in a real browser.
 *
 * These cover the things the unit tests structurally cannot: that a page actually
 * renders rather than throwing on the server, that the navigation between them works,
 * and that the rendered PNGs load as images rather than as broken icons.
 */

test("the front page says when the next game is and who is top", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The league" })).toBeVisible();
  await expect(page.getByText("Next game")).toBeVisible();
  await expect(page.getByText("Top of the table")).toBeVisible();
});

test("you can walk from the front page to a player's card", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Full table" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Season table")).toBeVisible();

  // The first player in the table. Clicking a name is the main way anybody navigates.
  const firstPlayer = page.locator("table a[href^='/players/']").first();
  const name = (await firstPlayer.textContent())?.trim() ?? "";
  await firstPlayer.click();

  await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    name.replace(/^\S+\s*/, ""),
  );
  await expect(page.getByText("Every game")).toBeVisible();
});

test("a player card renders as a real image, not a broken one", async ({ page }) => {
  await page.goto("/players");
  await page.locator("a[href^='/players/']").first().click();

  const card = page.getByRole("img", { name: /player card/ });
  await expect(card).toBeVisible();

  // A broken image still has a box; naturalWidth is what tells you it decoded.
  await expect
    .poll(async () => card.evaluate((img: HTMLImageElement) => img.naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(100);
});

test("every page in the nav loads", async ({ page }) => {
  await page.goto("/");

  for (const label of ["Table", "Players", "Fixtures", "Records"]) {
    await page.getByRole("navigation").getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("an unknown player is a 404, not a blank page", async ({ page }) => {
  const response = await page.goto("/players/00000000-0000-0000-0000-000000000000");
  expect(response?.status()).toBe(404);
});

test("the fixtures page links through to a match report", async ({ page }) => {
  await page.goto("/fixtures");

  // Results are listed after upcoming games, so the last link is a played one.
  await page.locator("a[href^='/fixtures/']").last().click();
  await expect(page).toHaveURL(/\/fixtures\/[0-9a-f-]{36}/);
  await expect(page.getByText("What everyone said they did")).toBeVisible();
});

test("nothing on the site ever shows a Telegram id", async ({ page }) => {
  // The pages read through the anon key, which cannot see those columns at all. This
  // is the browser-level confirmation of that.
  for (const path of ["/", "/table", "/players", "/fixtures", "/records"]) {
    await page.goto(path);
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/\b1000(0[1-9]|1[0-6])\b/);
  }
});
