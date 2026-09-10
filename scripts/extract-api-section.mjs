/**
 * Pulls one section out of the saved Bot API reference and prints its field table.
 *
 * The reference is nearly a megabyte, which is too much to read whole; this exists so
 * signatures can be read off the real docs rather than recalled.
 *
 * Usage: node scripts/extract-api-section.mjs <file.html> <anchor> [anchor...]
 */
import { readFileSync } from "node:fs";

const [file, ...anchors] = process.argv.slice(2);
const html = readFileSync(file, "utf8");

const strip = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

for (const anchor of anchors) {
  const start = html.indexOf(`<a class="anchor" name="${anchor}"`);
  if (start === -1) {
    console.log(`\n### ${anchor}\n(not found)`);
    continue;
  }

  // Up to the next anchor, or a generous slice if this is the last one.
  const nextAnchor = html.indexOf('<a class="anchor" name="', start + 10);
  const section = html.slice(start, nextAnchor === -1 ? start + 12000 : nextAnchor);

  console.log(`\n### ${anchor}`);

  const prose = section.slice(0, section.indexOf("<table") === -1 ? 900 : section.indexOf("<table"));
  const proseText = strip(prose);
  if (proseText) console.log(proseText.slice(0, 900));

  const rows = section.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh]>[\s\S]*?<\/t[dh]>/g) ?? []).map(strip);
    if (cells.length === 0) continue;
    console.log(`  | ${cells.join(" | ")}`);
  }
}
