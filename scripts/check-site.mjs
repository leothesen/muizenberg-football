/**
 * Walks the public website against a running dev server.
 *
 * The check that matters most is the last one. Every page reads through the anon key,
 * which can only see the curated views — but "the views don't expose Telegram ids" is
 * a claim, and this turns it into a test by looking for the seeded ids in the actual
 * HTML that gets served.
 *
 * Usage: node scripts/check-site.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
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

const fixtures = await page("/fixtures");
const fixtureId = /\/fixtures\/([0-9a-f-]{36})/.exec(fixtures.html)?.[1];
check("found a fixture to inspect", Boolean(fixtureId), fixtureId ?? "none");

const paths = [
  ["/", "The Wednesday League"],
  ["/table", "Season table"],
  ["/players", "in the league"],
  ["/fixtures", "Results"],
  ["/records", "Hall of fame"],
  ["/login", "Muizenberg Wednesdays"],
  [`/players/${playerId}`, "Every game"],
  [`/fixtures/${fixtureId}`, "Man of the match"],
];

const fetched = [];

for (const [path, marker] of paths) {
  const result = await page(path);
  fetched.push({ path, html: result.html });
  check(`${path} renders`, result.status === 200, `status ${result.status}`);
  check(`${path} has real content`, result.html.includes(marker), `looking for "${marker}"`);
}

// A missing player must 404 rather than crash or render an empty shell.
const missing = await page("/players/00000000-0000-0000-0000-000000000000");
check("unknown player 404s", missing.status === 404, `status ${missing.status}`);

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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
