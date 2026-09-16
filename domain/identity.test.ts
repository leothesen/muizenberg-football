import { describe, expect, it } from "vitest";
import { MAX_DISPLAY_NAME, parseDisplayName, parseEmoji } from "./identity";

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected a value, got: ${result.reason}`);
  return result.value;
}

describe("parseDisplayName", () => {
  it("takes the ordinary case unchanged", () => {
    expect(value(parseDisplayName("Daniel G."))).toBe("Daniel G.");
  });

  it("flattens the whitespace a paste brings with it", () => {
    // A name copied out of another app arrives with a non-breaking space in it and
    // then compares as a different name to the one it looks exactly like.
    expect(value(parseDisplayName("  Daniel  G.  "))).toBe("Daniel G.");
  });

  it("keeps the accents and the scripts", () => {
    expect(value(parseDisplayName("Sié"))).toBe("Sié");
    expect(value(parseDisplayName("Тимур"))).toBe("Тимур");
  });

  it("refuses an empty one rather than blanking somebody's name", () => {
    expect(parseDisplayName("   ").ok).toBe(false);
  });

  it("refuses punctuation pretending to be a name", () => {
    expect(parseDisplayName("...").ok).toBe(false);
  });

  it("refuses the invisible characters that would reverse the team sheet", () => {
    // A right-to-left override flips everything printed after it, which on a numbered
    // squad list is somebody else's name arriving backwards.
    expect(parseDisplayName("Leo‮").ok).toBe(false);
    expect(parseDisplayName("Leo").ok).toBe(false);
  });

  it("refuses a name the sheet cannot fit", () => {
    expect(parseDisplayName("x".repeat(MAX_DISPLAY_NAME)).ok).toBe(true);
    expect(parseDisplayName("x".repeat(MAX_DISPLAY_NAME + 1)).ok).toBe(false);
  });

  it("counts an emoji in a name as one character, not two", () => {
    // Twenty dinosaurs is forty UTF-16 units. Measuring `.length` would refuse a name
    // that fits on the sheet perfectly well.
    const withPictures = `Leo ${"🦖".repeat(MAX_DISPLAY_NAME - 4)}`;
    expect(withPictures.length).toBeGreaterThan(MAX_DISPLAY_NAME);
    expect(parseDisplayName(withPictures).ok).toBe(true);
  });

  it("refuses a name made only of pictures", () => {
    // Nothing to read out at the side of a pitch, and the emoji already sits in front
    // of the name anyway.
    expect(parseDisplayName("🦖🦖").ok).toBe(false);
  });
});

describe("parseEmoji", () => {
  it("takes a plain one", () => {
    expect(value(parseEmoji(" 🦖 "))).toBe("🦖");
  });

  it("takes the ones that are several code points", () => {
    // A family is seven code points and a skin tone is two. Both are one picture to
    // the person who tapped them, and refusing them would look like a bug.
    expect(value(parseEmoji("👨‍👩‍👧"))).toBe("👨‍👩‍👧");
    expect(value(parseEmoji("👍🏾"))).toBe("👍🏾");
  });

  it("takes a flag and a keycap", () => {
    // Regional indicators are not Extended_Pictographic, and the South African flag
    // was always going to be the first thing somebody tried.
    expect(value(parseEmoji("🇿🇦"))).toBe("🇿🇦");
    expect(value(parseEmoji("7️⃣"))).toBe("7️⃣");
  });

  it("refuses letters", () => {
    expect(parseEmoji("LFC").ok).toBe(false);
    expect(parseEmoji("").ok).toBe(false);
  });

  it("refuses a row of them", () => {
    expect(parseEmoji("🦖🦖").ok).toBe(false);
    expect(parseEmoji("🦖 hello").ok).toBe(false);
  });
});
