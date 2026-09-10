#!/usr/bin/env node
/**
 * Check that the migration folder and its journal agree.
 *
 * drizzle-kit decides what to run from `drizzle/meta/_journal.json`, never from the
 * directory listing. A `.sql` file that is not in the journal is therefore not a
 * migration at all — it is an inert text file that will never be applied to anything,
 * and nothing anywhere else complains. That is a bad way to find out, because the
 * first symptom is production missing a table.
 *
 * The reverse is worse in a different way: a journal entry with no file makes
 * `drizzle-kit migrate` fail at deploy time, which is now inside the Vercel build.
 *
 * Both are cheap to rule out here, before either one reaches a database.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DIR = path.resolve(process.cwd(), "drizzle");
const JOURNAL = path.join(DIR, "meta", "_journal.json");

function fail(lines) {
  console.error("Migration folder and journal disagree.\n");
  for (const line of lines) console.error(`  - ${line}`);
  console.error(
    "\nMigrations are created with `pnpm drizzle:generate --custom`, which writes " +
      "both the file and its journal entry. A file added by hand is never applied.",
  );
  process.exit(1);
}

const journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
const entries = journal.entries ?? [];

const onDisk = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, -".sql".length))
  .sort();

const inJournal = entries.map((entry) => entry.tag).sort();

const problems = [];

for (const tag of onDisk) {
  if (!inJournal.includes(tag)) {
    problems.push(
      `${tag}.sql is on disk but has no journal entry — it will never run`,
    );
  }
}

for (const tag of inJournal) {
  if (!onDisk.includes(tag)) {
    problems.push(
      `${tag} is in the journal but has no .sql file — migrate will fail`,
    );
  }
}

// Contiguous and ascending. A gap or a repeat means two migrations were generated
// from the same starting point and one of them silently owns the other's slot.
entries.forEach((entry, position) => {
  if (entry.idx !== position) {
    problems.push(
      `journal entry ${entry.tag} has idx ${entry.idx} but sits at position ${position}`,
    );
  }
});

if (problems.length > 0) fail(problems);

console.log(
  `Migrations consistent: ${entries.length} in the journal, ${onDisk.length} on disk.`,
);
