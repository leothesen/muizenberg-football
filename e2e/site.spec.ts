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

test("the front page offers the way in, twice", async ({ page }) => {
  await page.goto("/");

  // Joining the group IS the sign-up, so the link to it has to be on the page
  // somebody lands on rather than only somewhere they have to go looking.
  const join = page.getByRole("link", { name: /Join the group/ });
  await expect(join).toBeVisible();
  await expect(join).toHaveAttribute("href", /^https:\/\/t\.me\//);

  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
});

test("how it works walks a week, one message at a time", async ({ page }) => {
  await page.goto("/how-it-works");

  // One step at a time, starting on Monday. The text is rendered by the bot's own
  // message builders, so this is the actual chat rather than copy about it.
  await expect(page.getByText("Which night this week?")).toBeVisible();
  await expect(page.getByText(/Football tomorrow/)).toHaveCount(0);

  // Monday is the player's move, and the label is what says so — the page no longer
  // carries a sentence telling you to press a button in the message.
  await expect(page.getByText("Your turn")).toBeVisible();

  // The bot's own buttons are the way through, and a tap earns the private reply
  // only the tapper would see in the real group.
  await page.getByRole("button", { name: /Wednesday/ }).click();
  await expect(page.getByText("Only you saw this")).toBeVisible();
  await expect(page.getByText(/We're on/)).toBeVisible();

  // Tuesday is the bot's, and saying so is how the page makes its argument without
  // claiming "nobody is in charge" in prose for the fifth time.
  await expect(page.getByText("Nothing to do")).toBeVisible();

  // Walk to the end and back to the start. Every step carries the same Next,
  // including the two whose message has its own buttons — the way forward must not
  // change shape halfway through the tour.
  for (let step = 0; step < 4; step += 1) {
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
});

test("how it works keeps the join button for the end", async ({ page }) => {
  await page.goto("/how-it-works");

  // One join, at the foot of the page. Asking above the transcript puts the close
  // before the pitch — the page is the argument, so the ask comes after it.
  const join = page.getByRole("link", { name: /Join the group/ });
  await expect(join).toHaveCount(1);

  const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
  const button = await join.boundingBox();
  expect(button!.y).toBeGreaterThan(heading!.y + 400);
});

test("the front page says what you actually have to do", async ({ page }) => {
  await page.goto("/");

  // In week one this page is three empty states. The one question a newcomer has has
  // to be answered here, not only behind a link most of them will never follow.
  await expect(page.getByText(/You tap three times a week/)).toBeVisible();

  // One destination, one name. The header button and the link under the hero both
  // point at /how-it-works and used to carry different labels.
  const labels = await page.getByRole("link", { name: "How it works" }).count();
  expect(labels).toBe(2);
});

test("how it works can be read straight through, and draws its pictures", async ({
  page,
}) => {
  await page.goto("/how-it-works");
  await page.getByRole("button", { name: "Show the whole week" }).click();

  // Progressive disclosure is never the only way to the content.
  await expect(page.getByText("Which night this week?")).toBeVisible();
  await expect(page.getByText(/Football tomorrow/)).toBeVisible();

  // The pictures are drawn from fabricated data, so they work on an empty league —
  // which is the state this page matters most in.
  const teamSheet = page.getByRole("img", { name: /team sheet/ });
  await expect(teamSheet).toBeVisible();
  await expect
    .poll(async () => teamSheet.evaluate((img: HTMLImageElement) => img.naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(100);
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
