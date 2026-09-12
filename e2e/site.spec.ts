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

test("the front page greets a first-time visitor, once", async ({ page }) => {
  await page.goto("/");

  // A fresh browser context has no localStorage, which is exactly a first visit.
  const hint = page.getByRole("complementary", { name: "New here?" });
  await expect(hint).toBeVisible();
  await expect(hint.getByRole("link", { name: /how it works/i })).toBeVisible();

  await hint.getByRole("button", { name: "Dismiss" }).click();
  await expect(hint).toHaveCount(0);

  // And it stays gone — a greeting that came back on every load would be worse than
  // never showing it at all.
  await page.reload();
  await expect(page.getByRole("complementary", { name: "New here?" })).toHaveCount(0);
});

test("the demo chat is drawn as Telegram, not as a web form", async ({ page }) => {
  await page.goto("/how-it-works");

  // The chat header, the date separator and the clock in the corner are most of what
  // makes a reader recognise the thing they are being shown.
  await expect(page.getByText("Muiziez Footy")).toBeVisible();
  await expect(page.getByText("38 members")).toBeVisible();
  await expect(page.getByText("Monday afternoon")).toBeVisible();
  // 17:00 because that is when the Monday poll really goes out: 15:00 UTC in vercel.json.
  await expect(page.getByText("17:00")).toBeVisible();
  await expect(page.getByText("The Manager").first()).toBeVisible();

  // The bubble has to sit on the wallpaper rather than dissolve into it. Both were
  // bg-sand-100 once, so a message was a hairline border and nothing else.
  const bubble = page.locator(".bg-chat-bubble").last();
  const paper = page.locator(".bg-chat-paper").first();
  const bubbleColour = await bubble.evaluate((el) => getComputedStyle(el).backgroundColor);
  const paperColour = await paper.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bubbleColour).not.toBe(paperColour);
});

/** Whether two boxes share any area at all. Touching edges do not count. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("the tour snaps into view and fits on one screen", async ({ page }) => {
  await page.goto("/how-it-works");

  const snap = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
  expect(await snap()).toContain("y");

  await page.locator(".tour-snap").evaluate((el) => el.scrollIntoView({ block: "start" }));

  // The whole chat window and the way on are on screen together — header to keyboard,
  // and Next — rather than a chat you have to scroll past to find the button under it.
  const viewport = page.viewportSize()!;
  for (const locator of [
    page.locator(".bg-chat-paper").first(),
    page.getByRole("button", { name: "Next" }),
  ]) {
    const box = (await locator.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  // The long read is not snapped. A page that grabs the scroll of a transcript is
  // fighting the person reading it.
  await page.getByRole("button", { name: "Show the whole week" }).click();
  expect(await snap()).toBe("none");
});

test("the notes point at what to do, and never sit on the chat", async ({ page }) => {
  await page.goto("/how-it-works");
  await page.locator(".tour-snap").evaluate((el) => el.scrollIntoView({ block: "start" }));

  // Beside the chat on a wide screen, under it on a phone.
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  const chat = page.locator(".bg-chat-paper").first();
  const next = page.getByRole("button", { name: /^(Next|Start again)$/ });

  for (let step = 0; step < 6; step += 1) {
    const notes = page.getByRole("note");
    await expect(notes.first()).toBeVisible();
    if (wide) {
      // Placed next to their targets, not parked at the top of the column.
      await expect(page.locator("[data-callout]:not([data-placed])")).toHaveCount(0);
    }

    // Nothing the chat shows is ever underneath a note.
    const chatBox = (await chat.boundingBox())!;
    for (const note of await notes.all()) {
      const label = await note.getAttribute("aria-label");
      expect(overlaps((await note.boundingBox())!, chatBox), `"${label}" covers the chat`).toBe(
        false,
      );
    }

    // Exactly one thing to press on each step, and the first note is about it.
    const keyboard = page.locator("[data-tour=keyboard][data-action]");
    if ((await keyboard.count()) > 0) {
      await expect(notes.first()).toHaveAttribute("data-target", "keyboard");
      expect(await next.getAttribute("data-action")).toBeNull();

      // And the buttons are actually on screen inside the chat. On a phone the
      // messages scroll within the window; a tour that points at a keyboard scrolled
      // out of view is pointing at nothing.
      const keys = (await keyboard.boundingBox())!;
      expect(keys.y).toBeGreaterThanOrEqual(chatBox.y);
      expect(keys.y + keys.height).toBeLessThanOrEqual(chatBox.y + chatBox.height);

      if (wide) {
        // Level with the buttons it is about, so the line to them is short.
        const note = (await notes.first().boundingBox())!;
        const centre = note.y + note.height / 2;
        expect(centre).toBeGreaterThan(keys.y - note.height / 2);
        expect(centre).toBeLessThan(keys.y + keys.height + note.height / 2);
      }
    } else {
      expect(await next.getAttribute("data-action")).not.toBeNull();
    }

    if (step < 5) await page.getByRole("button", { name: "Next" }).click();
  }
});

test("the questionnaire shows how stats get recorded, one tap at a time", async ({ page }) => {
  await page.goto("/how-it-works");
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: "Next" }).click();
  }

  // The evening of the game, in the private chat with the bot rather than the group.
  await expect(page.getByText("That evening")).toBeVisible();
  await expect(page.getByText("Muiziez Footy")).toHaveCount(0);
  await expect(page.getByText(/Evening Pieter/)).toBeVisible();

  // The real first question, with its own buttons.
  await expect(page.getByText("How many did you score?")).toBeVisible();
  await expect(page.getByText("1 of 9")).toBeVisible();

  // Each tap edits the one message on to the next question, as the bot does.
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText("Any assists?")).toBeVisible();
  await expect(page.getByText("How many did you score?")).toHaveCount(0);
  await expect(page.getByText(/edited/)).toBeVisible();

  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByText("Nutmegs?")).toBeVisible();

  // Skipping ends it, and what you tapped is exactly what gets logged.
  await page.getByRole("button", { name: "Skip the rest" }).click();
  await expect(page.getByText("Logged")).toBeVisible();
  await expect(page.getByText(/2 ⚽\s+1 🎁/)).toBeVisible();
  const logged = page.getByRole("note", { name: "Added up by morning" });
  await expect(logged).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    // Beside the "Logged" message it is about — not the greeting above it, which is
    // where it pointed when placement took the first message on the step.
    await expect(page.locator("[data-callout]:not([data-placed])")).toHaveCount(0);
    const message = (await page.locator("[data-tour=text]").last().boundingBox())!;
    const note = (await logged.boundingBox())!;
    const centre = note.y + note.height / 2;
    expect(centre).toBeGreaterThan(message.y - note.height / 2);
    expect(centre).toBeLessThan(message.y + message.height + note.height / 2);
  }

  // And the week carries on to the report built from everybody's answers.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/Black 9-8 White/)).toBeVisible();
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
  await expect(page.getByText(/The bot asks you three times a week/)).toBeVisible();

  // One destination, one name. The header button and the link under the hero both
  // point at /how-it-works and used to carry different labels ("How it works" and
  // "See how a week works"), which read as two things to investigate.
  //
  // `exact` matters here: getByRole's name is a case-insensitive SUBSTRING match by
  // default, so without it this also counts the first-visit greeting's "Here's how it
  // works" — which is deliberately a sentence, being one, and is not a third name for
  // the page.
  const labels = await page
    .getByRole("link", { name: "How it works", exact: true })
    .count();
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
