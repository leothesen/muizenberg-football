/**
 * Walks the public website against a running dev server.
 *
 * The check that matters most is the last one. Every page reads as `web_reader`,
 * which can only see the curated views — but "the views don't expose Telegram ids" is
 * a claim, and this turns it into a test by looking for the seeded ids in the actual
 * HTML that gets served.
 *
 * Two things make it a real check rather than a comforting one. It finds the ids in
 * *served output*, so it catches a leak however it arrives — through a view, through
 * a stray prop, through a debug dump. And it has been verified to fail: renaming a
 * player to "Leaky 100001" makes three pages report the leak immediately.
 *
 * Needs the dev server rather than a production build, because it walks the app the
 * way a visitor does and the seeded data is loaded through the dev routes, which a
 * production build correctly refuses to expose.
 *
 * Usage: pnpm check:site [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(
    `${condition ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

async function page(path) {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();
  return { status: response.status, html };
}

// Discover real ids rather than hardcoding them, so this keeps working after a reset.
const seed = await page("/players");
const playerId = /\/players\/([0-9a-f-]{36})/.exec(seed.html)?.[1];
check("found a player to inspect", Boolean(playerId), playerId ?? "none");

// Deliberately the LAST fixture link, not the first. The page lists upcoming games
// above results, so the first link is a fixture with no teams, no score and no man of
// the match — checking it would test the emptiest page on the site and call it a pass.
const fixtures = await page("/fixtures");
const fixtureIds = [
  ...fixtures.html.matchAll(/\/fixtures\/([0-9a-f-]{36})/g),
].map((m) => m[1]);
const fixtureId = fixtureIds.at(-1);
check(
  "found a played fixture to inspect",
  Boolean(fixtureId),
  fixtureId ?? "none",
);

const paths = [
  ["/", "The league"],
  ["/table", "Season table"],
  ["/players", "in the league"],
  ["/fixtures", "Results"],
  ["/records", "Hall of fame"],
  ["/login", "Log in"],
  [`/players/${playerId}`, "Every game"],
  [`/fixtures/${fixtureId}`, "Man of the match"],
];

const fetched = [];

for (const [path, marker] of paths) {
  const result = await page(path);
  fetched.push({ path, html: result.html });
  check(`${path} renders`, result.status === 200, `status ${result.status}`);
  check(
    `${path} has real content`,
    result.html.includes(marker),
    `looking for "${marker}"`,
  );
}

// A missing player must 404 rather than crash or render an empty shell.
const missing = await page("/players/00000000-0000-0000-0000-000000000000");
check(
  "unknown player 404s",
  missing.status === 404,
  `status ${missing.status}`,
);

// The seeded Telegram ids are 100001-100016. None of them belongs on a public page,
// and neither does the word itself.
const TELEGRAM_IDS = Array.from({ length: 16 }, (_, i) => String(100001 + i));

for (const { path, html } of fetched) {
  const leaked = TELEGRAM_IDS.filter((id) => html.includes(id));
  check(`${path} leaks no telegram id`, leaked.length === 0, leaked.join(", "));
  check(
    `${path} never mentions telegram_user_id`,
    !html.includes("telegram_user_id") && !html.includes("telegram_username"),
  );
}

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
