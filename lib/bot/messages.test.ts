import { describe, expect, it } from "vitest";
import type { Commitment, PlayerLike } from "@/domain/types";
import { escapeHtml, playerLabel, sentenceList } from "./format";
import { rsvpAcknowledgement, rsvpKeyboard, squadMessage, type FixtureLike } from "./messages";
import { decodeCallback } from "@/lib/telegram/callbacks";

const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";
const KICKOFF = new Date("2026-09-16T16:00:00Z"); // Wed 18:00 SAST
const TUESDAY = new Date("2026-09-15T14:00:00Z");

const FIXTURE: FixtureLike = {
  id: FIXTURE_ID,
  kickoffAt: KICKOFF,
  venue: "Muizenberg",
  rsvpClosesAt: new Date("2026-09-16T10:00:00Z"),
  shape: { playersPerTeam: 8, subsPerTeam: 3 },
};

function player(id: string, displayName = id): PlayerLike {
  return { id, displayName, emoji: "⚽", rating: 65 };
}

function commitments(n: number): Commitment[] {
  const base = new Date("2026-09-15T14:05:00Z").getTime();
  return Array.from({ length: n }, (_, i) => ({
    player: player(`p${String(i).padStart(2, "0")}`),
    inSince: new Date(base + i * 60_000),
  }));
}

describe("escapeHtml", () => {
  it("neutralises a display name that contains markup", () => {
    expect(escapeHtml('<b>Big</b> "Dave" & co')).toBe(
      "&lt;b&gt;Big&lt;/b&gt; &quot;Dave&quot; &amp; co",
    );
  });

  it("escapes names inside a player label", () => {
    expect(playerLabel({ displayName: "<script>", emoji: "🦁" })).toBe("🦁 &lt;script&gt;");
  });
});

describe("sentenceList", () => {
  it("reads like a sentence", () => {
    expect(sentenceList([])).toBe("");
    expect(sentenceList(["Leo"])).toBe("Leo");
    expect(sentenceList(["Leo", "Sipho"])).toBe("Leo and Sipho");
    expect(sentenceList(["Leo", "Sipho", "Ndu"])).toBe("Leo, Sipho and Ndu");
  });
});

describe("squadMessage", () => {
  it("invites the first person when nobody has answered", () => {
    const text = squadMessage(FIXTURE, { commitments: [], maybes: [], outs: [] }, TUESDAY);
    expect(text).toContain("Nobody yet");
    expect(text).toContain("IN — 0/22");
    expect(text).toContain("needed or this is off");
  });

  it("says tomorrow when the poll goes out on Tuesday", () => {
    const text = squadMessage(FIXTURE, { commitments: [], maybes: [], outs: [] }, TUESDAY);
    expect(text).toContain("Football tomorrow");
    expect(text).toContain("Wednesday 16 September, 18:00");
  });

  it("numbers the squad in commitment order", () => {
    const text = squadMessage(
      FIXTURE,
      { commitments: commitments(3), maybes: [], outs: [] },
      TUESDAY,
    );
    expect(text).toContain("1. ⚽ p00");
    expect(text).toContain("3. ⚽ p02");
  });

  it("declares the game on once enough people are in", () => {
    const text = squadMessage(
      FIXTURE,
      { commitments: commitments(8), maybes: [], outs: [] },
      TUESDAY,
    );
    expect(text).toContain("Game is on");
    expect(text).toContain("Room for 14 more");
  });

  it("shows a waiting list once it is full, and says people drop out", () => {
    const text = squadMessage(
      FIXTURE,
      { commitments: commitments(25), maybes: [], outs: [] },
      TUESDAY,
    );
    expect(text).toContain("IN — 22/22");
    expect(text).toContain("WAITING — 3");
    expect(text).toContain("people always drop out");
  });

  it("lists maybes and outs separately without numbering them", () => {
    const text = squadMessage(
      FIXTURE,
      {
        commitments: commitments(2),
        maybes: [{ displayName: "Jonty", emoji: "🎩" }],
        outs: [{ displayName: "Craig", emoji: "🐢" }],
      },
      TUESDAY,
    );
    expect(text).toContain("MAYBE — 1");
    expect(text).toContain("🎩 Jonty");
    expect(text).toContain("OUT — 1");
    expect(text).toContain("🐢 Craig");
  });

  it("escapes a hostile display name rather than rendering it", () => {
    const nasty: Commitment[] = [
      { player: player("x", "<b>pwned</b>"), inSince: new Date("2026-09-15T14:05:00Z") },
    ];
    const text = squadMessage(FIXTURE, { commitments: nasty, maybes: [], outs: [] }, TUESDAY);
    expect(text).not.toContain("<b>pwned</b>");
    expect(text).toContain("&lt;b&gt;pwned&lt;/b&gt;");
  });
});

describe("rsvpKeyboard", () => {
  it("offers in, out and maybe against this fixture", () => {
    const keyboard = rsvpKeyboard(FIXTURE_ID);
    const actions = keyboard.inline_keyboard[0]!.map((b) => decodeCallback(b.callback_data!));
    expect(actions).toEqual([
      { kind: "rsvp", status: "in", fixtureId: FIXTURE_ID },
      { kind: "rsvp", status: "out", fixtureId: FIXTURE_ID },
      { kind: "rsvp", status: "maybe", fixtureId: FIXTURE_ID },
    ]);
  });

  it("keeps every button inside Telegram's data limit", () => {
    for (const row of rsvpKeyboard(FIXTURE_ID).inline_keyboard) {
      for (const button of row) {
        expect(new TextEncoder().encode(button.callback_data!).length).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe("rsvpAcknowledgement", () => {
  it("tells someone who is in exactly where they stand", () => {
    const text = rsvpAcknowledgement({
      displayName: "Leo",
      status: "in",
      position: 4,
      waitlisted: false,
      spotsLeft: 3,
    });
    expect(text).toContain("You're in, Leo");
    expect(text).toContain("number 4");
    expect(text).toContain("3 spots left");
  });

  it("is honest but encouraging on the waiting list", () => {
    const text = rsvpAcknowledgement({
      displayName: "Craig",
      status: "in",
      position: 23,
      waitlisted: true,
      spotsLeft: 0,
    });
    expect(text).toContain("waiting list");
    expect(text).toContain("number 23");
    expect(text).toContain("keep your evening free");
  });

  it("does not guilt-trip somebody who cannot make it", () => {
    const text = rsvpAcknowledgement({
      displayName: "Ruan",
      status: "out",
      position: null,
      waitlisted: false,
      spotsLeft: 5,
    });
    expect(text).toContain("No worries");
    expect(text.toLowerCase()).not.toContain("disappoint");
  });

  it("escapes the name it greets you with", () => {
    const text = rsvpAcknowledgement({
      displayName: "<i>x</i>",
      status: "out",
      position: null,
      waitlisted: false,
      spotsLeft: 1,
    });
    expect(text).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});
