/**
 * Dev helper: pulls the most recent photo the emulator recorded and writes it out as
 * a PNG, so what the bot actually sent can be looked at rather than trusted.
 *
 * Usage: node scripts/decode-emulator-photo.mjs <in.txt> <out.png>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: decode-emulator-photo.mjs <in.txt> <out.png>");
  process.exit(1);
}

const raw = readFileSync(input, "utf8").trim();
const base64 = raw.replace(/^data:image\/png;base64,/, "");

if (base64 === raw) {
  console.error("that row is not a data URL:", raw.slice(0, 80));
  process.exit(1);
}

writeFileSync(output, Buffer.from(base64, "base64"));
console.log(`wrote ${output}`);
