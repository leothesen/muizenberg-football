import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { PickedTeams } from "@/domain/teams";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import type { TelegramChat, TelegramUpdate, TelegramUser } from "@/lib/telegram/types";
import type { FixtureRow, FixtureRsvpView, PlayerRow } from "@/lib/repo/mappers";
import type { StoredTeam } from "@/lib/repo/teams";
import type { MatchReportRow } from "@/lib/repo/reports";
import { encodeCallback, type CallbackAction } from "@/lib/telegram/callbacks";
import { handleUpdate, updateKind, type BotContext } from "./router";
import type { BotServices } from "./services";
import type { Venue } from "@/domain/venues";

const NOW = new Date("2026-09-15T14:30:00Z");
const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";
const GROUP_CHAT = -1001234567890;

function user(id: number, firstName = "Newbie"): TelegramUser {
  return { id, is_bot: false, first_name: firstName, username: firstName.toLowerCase() };
}

function playerRow(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: "player-1",
    telegram_user_id: 999,
    telegram_username: "newbie",
    first_name: "Newbie",
    last_name: null,
    display_name: "Newbie",
    emoji: "⚽",
    is_active: true,
    private_chat_id: null,
    rating: 65,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function fixtureRow(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: FIXTURE_ID,
    season_id: "season-1",
    kickoff_at: "2026-09-16T16:00:00Z",
    venue: "Zandvlei Sports Ground",
    venue_lat: null,
    venue_lon: null,
    venue_url: null,
    status: "open",
    players_per_team: 8,
    subs_per_team: 3,
    rsvp_chat_id: GROUP_CHAT,
    rsvp_message_id: 42,
    teams_message_id: null,
    rsvp_closes_at: "2026-09-16T10:00:00Z",
    cancelled_reason: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function rsvpView(overrides: Partial<FixtureRsvpView> = {}): FixtureRsvpView {
  return {
    fixture_id: FIXTURE_ID,
    player_id: "player-1",
    display_name: "Newbie",
    emoji: "⚽",
    rating: 65,
    status: "in",
    in_since: "2026-09-15T14:29:00Z",
    responded_at: "2026-09-15T14:29:00Z",
    promoted_at: null,
    squad_position: 1,
    is_waitlisted: false,
    bringing_ball: false,
    ...overrides,
  };
}

interface Harness {
  ctx: BotContext;
  transport: RecordingTransport;
  calls: string[];
  services: BotServices;
  state: {
    claimed: Set<number>;
    player: PlayerRow;
    isNew: boolean;
    fixture: FixtureRow | null;
    rsvps: FixtureRsvpView[];
    deactivated: number[];
    setRsvps: { fixtureId: string; playerId: string; status: string }[];
    venue: Venue | null;
    cancelledReason: string | null;
    teams: StoredTeam[];
    added: { side: string; playerId: string; isSub: boolean }[];
  };
}

function harness(overrides: Partial<Harness["state"]> = {}): Harness {
  const calls: string[] = [];
  const state: Harness["state"] = {
    claimed: new Set<number>(),
    player: playerRow(),
    isNew: true,
    fixture: fixtureRow(),
    rsvps: [rsvpView()],
    deactivated: [],
    setRsvps: [],
    venue: null,
    cancelledReason: null,
    teams: [],
    added: [],
    ...overrides,
  };

  const services: BotServices = {
    async claimUpdate(updateId, kind) {
      calls.push(`claimUpdate:${kind}`);
      if (state.claimed.has(updateId)) return false;
      state.claimed.add(updateId);
      return true;
    },
    async ensurePlayer(u, options) {
      calls.push(`ensurePlayer:${u.id}${options?.privateChatId ? ":private" : ""}`);
      return { player: state.player, isNew: state.isNew };
    },
    async findPlayerByTelegramId() {
      return state.player;
    },
    async deactivatePlayer(telegramUserId) {
      calls.push(`deactivate:${telegramUserId}`);
      state.deactivated.push(telegramUserId);
    },
    async setDisplayName(_playerId, displayName) {
      calls.push(`setDisplayName:${displayName}`);
      state.player = { ...state.player, display_name: displayName };
    },
    async setEmoji(_playerId, emoji) {
      calls.push(`setEmoji:${emoji}`);
      state.player = { ...state.player, emoji };
    },
    async openFixture() {
      return state.fixture;
    },
    async fixtureById() {
      return state.fixture;
    },
    async setRsvp(fixtureId, playerId, status) {
      calls.push(`setRsvp:${status}`);
      state.setRsvps.push({ fixtureId, playerId, status });
    },
    async listRsvps() {
      return state.rsvps;
    },
    async toggleBall(_fixtureId, playerId) {
      calls.push("toggleBall");
      const row = state.rsvps.find((r) => r.player_id === playerId && r.status === "in");
      if (!row) return null;
      row.bringing_ball = !row.bringing_ball;
      return { bringing: row.bringing_ball };
    },
    async commitmentsFor() {
      return [];
    },
    async markPromoted(_fixtureId, playerIds) {
      calls.push(`markPromoted:${playerIds.length}`);
    },
    async teamsFor() {
      return state.teams;
    },
    async addToTeam(_fixtureId, side, playerId, isSub) {
      if (state.added.some((a) => a.playerId === playerId)) return false;
      state.added.push({ side, playerId, isSub });
      return true;
    },
    async setVenue(_fixtureId, venue) {
      calls.push(`setVenue:${venue.name}`);
      state.venue = venue;
    },
    async upcomingFixture() {
      return state.fixture;
    },
    async setFixtureStatus(_fixtureId, status, reason) {
      calls.push(`setFixtureStatus:${status}`);
      state.cancelledReason = reason ?? null;
      if (state.fixture) state.fixture = { ...state.fixture, status };
    },
  };

  const transport = new RecordingTransport();
  return {
    transport,
    calls,
    services,
    state,
    ctx: {
      client: new TelegramClient(transport),
      services,
      now: NOW,
      botUsername: "MuizenbergFootballBot",
    },
  };
}

describe("updateKind", () => {
  it("names each update type", () => {
    expect(updateKind({ update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" }, date: 0 } })).toBe("message");
    expect(updateKind({ update_id: 1, callback_query: { id: "c", from: user(1), chat_instance: "x" } })).toBe("callback_query");
    expect(updateKind({ update_id: 1 })).toBe("unknown");
  });
});

describe("de-duplication", () => {
  it("processes an update once and ignores the redelivery", async () => {
    const h = harness();
    const update: TelegramUpdate = {
      update_id: 5,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999)],
      },
    };

    await handleUpdate(h.ctx, update);
    await handleUpdate(h.ctx, update);

    expect(h.transport.callsTo("sendMessage")).toHaveLength(1);
  });
});

describe("joining the group", () => {
  it("enrols a newcomer and welcomes them where only they can see it", async () => {
    const h = harness();

    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999, "Sipho")],
      },
    });

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(sent.params.chat_id).toBe(GROUP_CHAT);
    expect(sent.params.ephemeral_message_parameters).toEqual({ receiver_user_id: 999 });
    expect(String(sent.params.text)).toContain("you're in the league");
    expect(String(sent.params.text)).toContain("Only you can see this");
  });

  it("never asks a newcomer to sign up for anything", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999)],
      },
    });

    const text = String(h.transport.lastCallTo("sendMessage")!.params.text).toLowerCase();
    expect(text).toContain("no signup, no password");
    expect(text).not.toContain("register");
  });

  it("does not send newcomers off to a private chat", async () => {
    // It used to ask them to start one so the questionnaire could reach them. Almost
    // nobody did, so on the first real Wednesday it reached nobody. It lives in the
    // group now, and nothing a newcomer needs depends on messaging the bot.
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999)],
      },
    });

    const sent = h.transport.lastCallTo("sendMessage")!.params;
    const markup = sent.reply_markup as { inline_keyboard: { url?: string }[][] };
    const urls = markup.inline_keyboard.flat().map((b) => b.url).filter(Boolean);

    expect(urls.some((url) => url!.startsWith("https://t.me/"))).toBe(false);
    expect(String(sent.text)).not.toContain("start a chat with me");
  });

  it("greets a returning member differently", async () => {
    const h = harness({ isNew: false });
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999, "Dave")],
      },
    });

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("Welcome back");
  });

  it("ignores bots being added", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [{ id: 7, is_bot: true, first_name: "SomeBot" }],
      },
    });

    expect(h.transport.calls).toHaveLength(0);
  });

  it("enrols someone who joins via an invite link (chat_member update)", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      chat_member: {
        chat: { id: GROUP_CHAT, type: "supergroup" },
        from: user(999),
        date: 0,
        old_chat_member: { status: "left", user: user(999) },
        new_chat_member: { status: "member", user: user(999) },
      },
    });

    expect(h.calls).toContain("ensurePlayer:999");
    expect(h.transport.callsTo("sendMessage")).toHaveLength(1);
  });

  it("retires somebody who leaves rather than deleting their history", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      chat_member: {
        chat: { id: GROUP_CHAT, type: "supergroup" },
        from: user(999),
        date: 0,
        old_chat_member: { status: "member", user: user(999) },
        new_chat_member: { status: "left", user: user(999) },
      },
    });

    expect(h.state.deactivated).toEqual([999]);
    expect(h.transport.calls).toHaveLength(0);
  });
});

describe("private messages", () => {
  it("captures the private chat id so post-match questions can be sent", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 999, type: "private" }, date: 0, from: user(999), text: "hi" },
    });

    expect(h.calls).toContain("ensurePlayer:999:private");
  });
});

describe("RSVP buttons", () => {
  it("records the answer and rewrites the squad message in place", async () => {
    const h = harness();

    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: {
        id: "cbq-1",
        from: user(999),
        chat_instance: "x",
        data: `r:i:${FIXTURE_ID}`,
      },
    });

    expect(h.state.setRsvps).toEqual([
      { fixtureId: FIXTURE_ID, playerId: "player-1", status: "in" },
    ]);

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(edit.params.chat_id).toBe(GROUP_CHAT);
    expect(edit.params.message_id).toBe(42);
    expect(String(edit.params.text)).toContain("IN — 1/22");
  });

  it("does not mark somebody signing up with room to spare as promoted", async () => {
    // Promoted means off the waiting list, which earns "The Rescuer" at settlement.
    // A plain "I'm in" with 21 places free was being recorded as one.
    const h = harness();

    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: {
        id: "cbq-1",
        from: user(999),
        chat_instance: "x",
        data: `r:i:${FIXTURE_ID}`,
      },
    });

    expect(h.calls.filter((call) => call.startsWith("markPromoted"))).toEqual([]);
  });

  /** What Telegram actually sends: a tap always knows the message it came from. */
  function tap(h: Harness, data: string, chatType: TelegramChat["type"] = "supergroup") {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e6),
      callback_query: {
        id: "cbq-1",
        from: user(999),
        chat_instance: "x",
        data,
        message: { message_id: 42, chat: { id: GROUP_CHAT, type: chatType }, date: 0 },
      },
    });
  }

  it("answers somebody who is in with a message only they can see", async () => {
    const h = harness();
    await tap(h, `r:i:${FIXTURE_ID}`);

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(String(sent.params.text)).toContain("You're in, Newbie — number 1");
    expect(sent.params.ephemeral_message_parameters).toEqual({
      receiver_user_id: 999,
      callback_query_id: "cbq-1",
    });
    // The send carries the callback id, so answering separately would be an error.
    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(0);
  });

  it("puts the calendar on that reply, where the decision was just made", async () => {
    const h = harness();
    await tap(h, `r:i:${FIXTURE_ID}`);

    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string; url?: string }[][];
    };
    expect(markup.inline_keyboard[0]![0]!.text).toContain("Add to calendar");
    expect(markup.inline_keyboard[0]![0]!.url).toContain(`/fixtures/${FIXTURE_ID}/add`);
  });

  it("keeps a toast for out and maybe, which have nothing to press", async () => {
    const h = harness();
    await tap(h, `r:o:${FIXTURE_ID}`);

    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(answer.params.callback_query_id).toBe("cbq-1");
    expect(String(answer.params.text)).toContain("No worries");
    // Callback answers are plain text, never HTML.
    expect(String(answer.params.text)).not.toContain("<");
  });

  it("answers the tap privately with where they stand", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: `r:i:${FIXTURE_ID}` },
    });

    // No message on the tap — inline mode — so the answer falls back to the toast
    // rather than trying to send into a private chat the bot may never have had.
    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(answer.params.callback_query_id).toBe("cbq-1");
    expect(String(answer.params.text)).toContain("You're in");
    expect(String(answer.params.text)).not.toContain("<");
  });

  it("uses a modal, not a toast, to tell somebody they are on the waiting list", async () => {
    const h = harness({ rsvps: [rsvpView({ squad_position: 23, is_waitlisted: true })] });
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: `r:i:${FIXTURE_ID}` },
    });

    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(answer.params.show_alert).toBe(true);
    expect(String(answer.params.text)).toContain("waiting list");
  });

  it("keeps the callback answer inside Telegram's 200 character limit", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: `r:i:${FIXTURE_ID}` },
    });

    const text = String(h.transport.lastCallTo("answerCallbackQuery")!.params.text);
    expect(text.length).toBeLessThanOrEqual(200);
  });

  it("refuses to change an RSVP for a game already played", async () => {
    const h = harness({ fixture: fixtureRow({ status: "played" }) });
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: `r:i:${FIXTURE_ID}` },
    });

    expect(h.state.setRsvps).toEqual([]);
    expect(String(h.transport.lastCallTo("answerCallbackQuery")!.params.text)).toContain(
      "been and gone",
    );
  });

  describe("after the teams are picked", () => {
    const onSheet = (id: string, rating = 65) => ({
      playerId: id,
      displayName: id,
      emoji: "⚽",
      rating,
      isSub: false,
    });
    const team = (side: "a" | "b", ids: string[]): StoredTeam => ({
      team: {
        id: `team-${side}`,
        fixture_id: FIXTURE_ID,
        side,
        name: side === "a" ? "Black" : "White",
        colour: side === "a" ? "kit-black" : "kit-white",
        goals: null,
        created_at: NOW.toISOString(),
      },
      players: ids.map((id) => onSheet(id)),
    });
    const inBefore = (id: string, minute: number) =>
      rsvpView({ player_id: id, display_name: id, in_since: `2026-09-15T13:${minute}:00Z` });

    function lockedHarness() {
      return harness({
        fixture: fixtureRow({ status: "locked", teams_message_id: 900 }),
        teams: [team("a", ["p1", "p2", "p3"]), team("b", ["p4", "p5"])],
        rsvps: [
          inBefore("p1", 10),
          inBefore("p2", 11),
          inBefore("p3", 12),
          inBefore("p4", 13),
          inBefore("p5", 14),
          rsvpView({ squad_position: 6 }),
        ],
      });
    }

    it("puts a late yes on the side that is a player short", async () => {
      const h = lockedHarness();
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.state.added).toEqual([{ side: "b", playerId: "player-1", isSub: false }]);
    });

    it("tells the group, so the side they joined knows", async () => {
      const h = lockedHarness();
      await tap(h, `r:i:${FIXTURE_ID}`);

      const announced = h.transport
        .callsTo("sendMessage")
        .map((c) => String(c.params.text))
        .find((text) => text.includes("joins"));
      expect(announced).toContain("Newbie joins ⚪ <b>White</b> — 3 v 3 now.");
    });

    it("tells the person which side they are on", async () => {
      const h = lockedHarness();
      await tap(h, `r:i:${FIXTURE_ID}`);

      const reply = h.transport
        .callsTo("sendMessage")
        .find((c) => c.params.ephemeral_message_parameters);
      expect(String(reply!.params.text)).toContain("you're on <b>White</b>");
    });

    it("leaves somebody already on the sheet where they are", async () => {
      const h = lockedHarness();
      h.state.rsvps = h.state.rsvps.filter((r) => r.player_id !== "player-1");
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.state.added).toEqual([]);
      expect(
        h.transport.callsTo("sendMessage").some((c) => String(c.params.text).includes("joins")),
      ).toBe(false);
    });

    it("keeps I'm in pressable on the poll", async () => {
      const h = lockedHarness();
      await tap(h, `r:i:${FIXTURE_ID}`);

      const markup = h.transport.lastCallTo("editMessageText")!.params.reply_markup as {
        inline_keyboard: { text: string; callback_data?: string }[][];
      };
      expect(markup.inline_keyboard[0]![0]!.callback_data).toBe(`r:i:${FIXTURE_ID}`);
    });

    function drawn(h: Harness, options: { failing?: boolean } = {}) {
      const drawnSheets: PickedTeams[] = [];
      h.ctx.pictures = {
        async render() {
          if (options.failing) throw new Error("satori exploded");
          return new Uint8Array([137, 80, 78, 71]);
        },
        async playerCard() {
          return null;
        },
        async leaderboard() {
          return null;
        },
        welcome() {
          return { element: createElement("div"), size: { width: 10, height: 10 } };
        },
        teamSheet({ teams }) {
          drawnSheets.push(teams);
          return { element: createElement("div"), size: { width: 10, height: 10 } };
        },
      };
      return drawnSheets;
    }

    it("redraws the team sheet in place with them on it", async () => {
      const h = lockedHarness();
      const sheets = drawn(h);
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(sheets).toHaveLength(1);
      expect(sheets[0]!.b.starters.map((p) => p.id)).toEqual(["p4", "p5", "player-1"]);
      expect(sheets[0]!.a.starters.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);

      const edit = h.transport.lastCallTo("editMessageMedia")!;
      expect(edit.params.message_id).toBe(900);
      expect(edit.params.chat_id).toBe(GROUP_CHAT);
      expect(edit.params.photo).toBeInstanceOf(Uint8Array);
      expect((edit.params.media as { media: string }).media).toBe("attach://photo");
      expect(String((edit.params.media as { caption: string }).caption)).toContain("Teams are up");
    });

    it("keeps the join button on the redrawn sheet", async () => {
      const h = lockedHarness();
      drawn(h);
      await tap(h, `r:i:${FIXTURE_ID}`);

      const markup = h.transport.lastCallTo("editMessageMedia")!.params.reply_markup as {
        inline_keyboard: { text: string; callback_data?: string }[][];
      };
      expect(markup.inline_keyboard[0]![0]).toMatchObject({
        text: "➕ Join",
        callback_data: `r:i:${FIXTURE_ID}`,
      });
    });

    it("rewrites the text instead when the picture cannot be drawn", async () => {
      const h = lockedHarness();
      drawn(h, { failing: true });
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.transport.callsTo("editMessageMedia")).toHaveLength(0);
      const sheetEdit = h.transport
        .callsTo("editMessageText")
        .find((c) => c.params.message_id === 900);
      expect(String(sheetEdit!.params.text)).toContain("Newbie");
    });

    it("still answers the tap when the sheet cannot be edited at all", async () => {
      const h = lockedHarness();
      drawn(h);
      h.transport.fail("editMessageMedia", new Error("message to edit not found"));
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.state.added).toHaveLength(1);
      expect(
        h.transport.callsTo("sendMessage").some((c) => String(c.params.text).includes("joins")),
      ).toBe(true);
    });

    it("leaves the sheet alone when nobody new is on it", async () => {
      const h = lockedHarness();
      drawn(h);
      h.state.rsvps = h.state.rsvps.filter((r) => r.player_id !== "player-1");
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.transport.callsTo("editMessageMedia")).toHaveLength(0);
    });

    it("adds nobody before the teams are picked", async () => {
      const h = harness({ teams: [team("a", ["p1"]), team("b", [])] });
      await tap(h, `r:i:${FIXTURE_ID}`);

      expect(h.state.added).toEqual([]);
    });
  });

  it("acknowledges an unrecognised button rather than leaving it spinning", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: "garbage" },
    });

    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);
  });
});

describe("joining after the poll has been posted", () => {
  function join(h: Harness) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        new_chat_members: [user(999, "Sipho")],
      },
    });
  }

  function rsvpButtons(h: Harness) {
    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    return markup.inline_keyboard.flat();
  }

  it("lets a newcomer answer without ever finding the pinned message", async () => {
    // The poll is pinned, but a supergroup set to hide history from new members hides
    // it completely — and even with history visible it may be hundreds of messages
    // back. Carrying the buttons in the welcome is what makes joining on match-day
    // morning still mean playing that night.
    const h = harness();
    await join(h);

    const buttons = rsvpButtons(h);
    expect(buttons.some((b) => b.text.includes("I'm in"))).toBe(true);
    expect(
      buttons.find((b) => b.text.includes("I'm in"))!.callback_data,
    ).toBe(`r:i:${FIXTURE_ID}`);
  });

  it("puts the answer first, above everything else in the welcome", async () => {
    // A newcomer reads one row before deciding whether this is worth their attention.
    const h = harness();
    await join(h);

    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string }[][];
    };
    expect(markup.inline_keyboard[0]!.some((b) => b.text.includes("I'm in"))).toBe(true);
  });

  it("still greets somebody when there is no game booked at all", async () => {
    const h = harness({ fixture: null });
    await join(h);

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "you're in the league",
    );
    expect(rsvpButtons(h).some((b) => b.text.includes("I'm in"))).toBe(false);
  });

  it("lets somebody who joins after teams are picked still say yes", async () => {
    // openFixture stops at `open`, so this used to greet a match-day joiner with
    // nothing to answer at all. Then it greeted them with a locked button. A yes
    // now puts them on a side, so the button has to be there to press.
    const h = harness({ fixture: fixtureRow({ status: "locked" }) });
    await join(h);

    const buttons = rsvpButtons(h);
    expect(buttons.some((b) => b.text.includes("I'm in") && b.callback_data)).toBe(true);
  });

  it("carries this week's night poll while the vote is still open", async () => {
    // Somebody joining on a Monday evening, after the poll went up and before Tuesday's
    // booking. There is no game yet, so the RSVP row had nothing to carry, and the
    // welcome said nothing about the vote actually running in the chat above them.
    const h = harness({ fixture: null });
    wireNights(h);
    await join(h);

    const nights = rsvpButtons(h).filter((b) => b.callback_data?.startsWith("n:"));
    expect(nights.map((b) => b.callback_data)).toEqual(["n:tue", "n:wed", "n:thu", "n:sat", "n:sun"]);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "Which night this week",
    );
  });

  it("leaves the night poll out once the night is booked", async () => {
    const h = harness({ fixture: null });
    wireNights(h, { ...OPEN_POLL, resolved_at: "2026-09-15T07:00:00Z" });
    await join(h);

    expect(rsvpButtons(h).some((b) => b.callback_data?.startsWith("n:"))).toBe(false);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).not.toContain(
      "Which night this week",
    );
  });

  it("leaves it out when no poll has gone up this week", async () => {
    const h = harness({ fixture: null });
    wireNights(h, null);
    await join(h);

    expect(rsvpButtons(h).some((b) => b.callback_data?.startsWith("n:"))).toBe(false);
  });
});

describe("bringing a mate", () => {
  function inviteHarness(cached: string | null = null) {
    const h = harness();
    const remembered: string[] = [];
    let stored = cached;

    h.ctx.leagueChatId = GROUP_CHAT;
    h.ctx.invites = {
      async cachedInviteLink() {
        return stored;
      },
      async rememberInviteLink(_chatId, link) {
        stored = link;
        remembered.push(link);
      },
    };

    return { ...h, remembered };
  }

  function sendBring(h: ReturnType<typeof inviteHarness>, chatType: "supergroup" | "private" = "supergroup") {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        chat: { id: chatType === "private" ? 999 : GROUP_CHAT, type: chatType },
        date: 0,
        from: user(999),
        text: "/bring",
      },
    });
  }

  it("hands out a link rather than inventing a player", async () => {
    // An earlier version created a guest record so somebody's mate could be counted
    // without installing anything. That counted them correctly and removed the only
    // reason they would ever join — which is the opposite of what this is for.
    const h = inviteHarness();
    h.transport.reply("createChatInviteLink", { invite_link: "https://t.me/+abc123" });

    await sendBring(h);

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(String(sent.params.text)).toContain("https://t.me/+abc123");
    expect(String(sent.params.text)).toContain("Joining the group is joining the league");
  });

  it("only the asker sees it, so the group is not littered with links", async () => {
    const h = inviteHarness();
    h.transport.reply("createChatInviteLink", { invite_link: "https://t.me/+abc123" });

    await sendBring(h);
    expect(h.transport.lastCallTo("sendMessage")!.params.ephemeral_message_parameters).toEqual({
      receiver_user_id: 999,
    });
  });

  it("remembers the link instead of minting a new one every time", async () => {
    // Telegram creates a fresh link on every call, and a group holding forty of them
    // in its settings is somebody's afternoon to clean up.
    const h = inviteHarness();
    h.transport.reply("createChatInviteLink", { invite_link: "https://t.me/+abc123" });

    await sendBring(h);
    await sendBring(h);

    expect(h.transport.callsTo("createChatInviteLink")).toHaveLength(1);
    expect(h.remembered).toEqual(["https://t.me/+abc123"]);
  });

  it("uses a link it already had without calling Telegram at all", async () => {
    const h = inviteHarness("https://t.me/+cached");
    await sendBring(h);

    expect(h.transport.callsTo("createChatInviteLink")).toHaveLength(0);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("+cached");
  });

  it("explains itself when the bot cannot make a link", async () => {
    // Needs admin rights with invite permission. It has them today because it pins
    // the poll, but an admin change elsewhere must not produce a stack trace in a
    // group chat.
    const h = inviteHarness();
    h.transport.fail("createChatInviteLink", new Error("Bad Request: not enough rights"));

    await sendBring(h);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "group admin",
    );
  });

  it("works from a private chat by falling back to the league group", async () => {
    const h = inviteHarness("https://t.me/+cached");
    await sendBring(h, "private");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("+cached");
  });
});

describe("anyone calling a game", () => {
  function gameHarness() {
    const h = harness();
    const booked: Date[] = [];

    h.ctx.fixtures = {
      async bookFixture(kickoffAt) {
        const existing = booked.some((d) => d.getTime() === kickoffAt.getTime());
        booked.push(kickoffAt);
        return {
          fixture: fixtureRow({ kickoff_at: kickoffAt.toISOString() }),
          created: !existing,
        };
      },
      async attachRsvpMessage(_id, _chat, messageId) {
        h.calls.push(`attachRsvp:${messageId}`);
      },
    };

    return { ...h, booked };
  }

  function sendGame(h: ReturnType<typeof gameHarness>, text: string) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text,
      },
    });
  }

  it("puts a game on the books with no vote and no permission", async () => {
    // The group's own description says Sunday evenings ad hoc, and the app had no
    // concept of a game outside the weekly rhythm at all.
    const h = gameHarness();
    await sendGame(h, "/game saturday 4pm");

    expect(h.booked).toHaveLength(1);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("Game on");
  });

  it("opens the poll immediately rather than waiting for a cron", async () => {
    // A game called on Thursday for Saturday has to start collecting answers on
    // Thursday, and the squad message is only editable once it is attached.
    const h = gameHarness();
    await sendGame(h, "/game saturday 4pm");

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(sent.params.reply_markup).toBeDefined();
    expect(h.calls.some((c) => c.startsWith("attachRsvp"))).toBe(true);
  });

  it("says out loud when it had to assume the time", async () => {
    // Somebody who typed "saturday" and meant the morning needs to see the assumed
    // hour before ten people have answered it.
    const h = gameHarness();
    await sendGame(h, "/game saturday");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "No time given",
    );
  });

  it("stays quiet about the time when one was given", async () => {
    const h = gameHarness();
    await sendGame(h, "/game saturday 4pm");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).not.toContain(
      "No time given",
    );
  });

  it("offers examples rather than guessing at something it cannot read", async () => {
    const h = gameHarness();
    await sendGame(h, "/game whenever");

    expect(h.booked).toHaveLength(0);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "/game sat 4pm",
    );
  });

  it("does not announce a second game for a slot that already has one", async () => {
    const h = gameHarness();
    await sendGame(h, "/game saturday 4pm");
    await sendGame(h, "/game saturday 4pm");

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "already a game",
    );
  });
});

describe("calling it off", () => {
  function sendOff(h: Harness, text: string) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text,
      },
    });
  }

  it("puts the question to the group rather than cancelling anything", async () => {
    // Nobody here has the authority to call a game off for everybody else. Handing
    // one person that power would recreate exactly the organiser this design removed.
    const h = harness();
    await sendOff(h, "/off pouring with rain");

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(String(sent.params.text)).toContain("Is this still on?");
    expect(String(sent.params.text)).toContain("pouring with rain");
    expect(String(sent.params.text)).toContain("Nobody decides this for anybody else");
    expect(h.calls).not.toContain("setFixtureStatus:cancelled");
  });

  it("marks the person who raised it as out", async () => {
    // They said it is off for them. Making them say it twice is the kind of friction
    // that gets a bot ignored.
    const h = harness();
    await sendOff(h, "/off");
    expect(h.state.setRsvps.at(-1)).toMatchObject({ status: "out" });
  });

  it("says it in the group even when sent as a DM", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 991,
      message: {
        message_id: 1,
        chat: { id: 999, type: "private" },
        date: 0,
        from: user(999),
        text: "/off flooded",
      },
    });

    expect(h.transport.lastCallTo("sendMessage")!.params.chat_id).toBe(GROUP_CHAT);
  });

  it("never abandons a game just because the turnout is thin", async () => {
    // The single most important rule in this file. Five people is a three and a two,
    // and telling them it is off is the one outcome that makes next week worse.
    const h = harness({
      fixture: fixtureRow({ status: "locked" }),
      rsvps: Array.from({ length: 5 }, (_, i) =>
        rsvpView({ player_id: `p${i}`, status: "in", squad_position: i + 1 }),
      ),
    });

    await sendOff(h, "/off only five of us");
    expect(h.calls).not.toContain("setFixtureStatus:cancelled");
  });

  it("ends the evening once there is nobody left on a picked team", async () => {
    // Teams were already picked and then everybody left. That is not a decision
    // anybody made, it is weather, and it is the only case the bot admits.
    const h = harness({
      fixture: fixtureRow({ status: "locked" }),
      rsvps: [rsvpView({ status: "out" })],
    });

    await sendOff(h, "/off it is bucketing");

    expect(h.calls).toContain("setFixtureStatus:cancelled");
    expect(h.state.cancelledReason).toBe("it is bucketing");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("Not tonight");
  });

  it("leaves an unlocked fixture alone however empty it is", async () => {
    // Before teams are picked there is still a day for people to come back, and
    // cancelling then would teach the group that answering early is a gamble.
    const h = harness({
      fixture: fixtureRow({ status: "open" }),
      rsvps: [rsvpView({ status: "out" })],
    });

    await sendOff(h, "/off");
    expect(h.calls).not.toContain("setFixtureStatus:cancelled");
  });

  it("offers a weather button on the pinned poll once teams are up", async () => {
    // Nobody types a command they have never been told about, and five o'clock on a
    // wet Wednesday is not the moment to go hunting for one.
    const h = harness({ fixture: fixtureRow({ status: "locked" }) });
    await handleUpdate(h.ctx, {
      update_id: 771,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text: "/next",
      },
    });

    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    const weather = markup.inline_keyboard.flat().find((b) => b.text.includes("Weather"));

    expect(weather?.callback_data).toBe(`w:${FIXTURE_ID}`);
  });

  it("keeps the weather button off a poll days before the game", async () => {
    // A weather button on a Tuesday is a suggestion that the game might not happen,
    // three days before anybody can possibly know.
    const h = harness({ fixture: fixtureRow({ status: "open" }) });
    await handleUpdate(h.ctx, {
      update_id: 772,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text: "/next",
      },
    });

    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string }[][];
    };
    expect(markup.inline_keyboard.flat().some((b) => b.text.includes("Weather"))).toBe(false);
  });

  it("the weather button does exactly what /off does", async () => {
    const h = harness({ fixture: fixtureRow({ status: "locked" }) });
    await handleUpdate(h.ctx, {
      update_id: 773,
      callback_query: {
        id: "cb-w",
        chat_instance: "x",
        from: user(999),
        data: `w:${FIXTURE_ID}`,
        message: { message_id: 9, chat: { id: GROUP_CHAT, type: "supergroup" }, date: 0 },
      },
    });

    expect(h.state.setRsvps.at(-1)).toMatchObject({ status: "out" });
    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);

    // Across every message, not just the last: this harness has a squad of one, so
    // the asker leaving empties it and "Not tonight" lands straight after the
    // question. Both are correct and both have to appear.
    const said = h.transport.callsTo("sendMessage").map((c) => String(c.params.text));
    expect(said.some((t) => t.includes("Is this still on?"))).toBe(true);
  });

  it("says so plainly when there is no game to call off", async () => {
    const h = harness({ fixture: null });
    await sendOff(h, "/off");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "No game on the books",
    );
  });
});

/** This week's poll as the nights repo stores it: the group message it lives in. */
interface StoredPoll {
  chat_id: number | null;
  message_id: number | null;
  resolved_at: string | null;
}

const OPEN_POLL: StoredPoll = { chat_id: GROUP_CHAT, message_id: 77, resolved_at: null };

/** Night votes kept in an array, so a toggle is observable, and a poll to edit. */
function wireNights(h: Harness, poll: StoredPoll | null = OPEN_POLL) {
  const stored: { playerId: string; night: string }[] = [];
  const times: { playerId: string; time: string }[] = [];

  h.ctx.nights = {
    async toggleNightVote({ playerId, night }) {
      const at = stored.findIndex((v) => v.playerId === playerId && v.night === night);
      if (at >= 0) {
        stored.splice(at, 1);
        return { voted: false };
      }
      stored.push({ playerId, night });
      return { voted: true };
    },
    async votesForWeek() {
      return stored.map((v) => ({ night: v.night }));
    },
    async toggleTimeVote({ playerId, time }) {
      const at = times.findIndex((v) => v.playerId === playerId && v.time === time);
      if (at >= 0) {
        times.splice(at, 1);
        return { voted: false };
      }
      times.push({ playerId, time });
      return { voted: true };
    },
    async timeVotesForWeek() {
      return times.map((v) => ({ time: v.time }));
    },
    async nightPoll() {
      return poll;
    },
  };

  return stored;
}

describe("voting on the night", () => {
  function nightHarness(poll: StoredPoll | null = OPEN_POLL) {
    const h = harness();
    const stored = wireNights(h, poll);
    return { ...h, stored };
  }

  function tapNight(h: ReturnType<typeof nightHarness>, night: string, messageId = 77) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: "cb-1",
        chat_instance: "ci-1",
        from: user(999),
        data: `n:${night}`,
        message: {
          message_id: messageId,
          chat: { id: GROUP_CHAT, type: "supergroup" },
          date: 0,
        },
      },
    });
  }

  it("records a vote and rewrites the poll in place", async () => {
    const h = nightHarness();
    await tapNight(h, "thu");

    expect(h.stored).toHaveLength(1);

    // Edited, not replied to. Thirty-eight people tapping five nights would otherwise
    // produce a wall of confirmations, which is exactly the "annoying enough to mute"
    // failure this has to avoid.
    const edit = h.transport.lastCallTo("editMessageText");
    expect(edit).toBeDefined();
    expect(String(edit!.params.text)).toContain("Thursday");
    expect(h.transport.callsTo("sendMessage")).toHaveLength(0);
  });

  it("edits the poll itself, whichever message the tap came from", async () => {
    // A newcomer's welcome carries the poll's buttons. Editing the message that was
    // tapped would rewrite their welcome into a copy of the poll and leave the real
    // poll's count behind; the stored poll message is the one that has to move.
    const h = nightHarness();
    await tapNight(h, "wed", 5);

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(edit.params.message_id).toBe(77);
    expect(edit.params.chat_id).toBe(GROUP_CHAT);
  });

  it("turns a vote away once the night has been booked", async () => {
    // Tuesday's booking used to leave the buttons live. Late taps went on being
    // stored and went on editing "Thursday is winning" into a poll whose week was
    // already booked for Wednesday.
    const h = nightHarness({ ...OPEN_POLL, resolved_at: "2026-09-15T07:00:00Z" });
    await tapNight(h, "thu");

    expect(h.stored).toHaveLength(0);
    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(String(answer.params.text)).toContain("closed");
  });

  it("turns a vote away when there is no poll for this week", async () => {
    // An old poll's buttons, tapped before this week's poll goes up on Monday.
    const h = nightHarness(null);
    await tapNight(h, "wed");

    expect(h.stored).toHaveLength(0);
    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
    expect(String(h.transport.lastCallTo("answerCallbackQuery")!.params.text)).toContain(
      "closed",
    );
  });

  it("lets one person hold several nights at once", async () => {
    const h = nightHarness();
    await tapNight(h, "wed");
    await tapNight(h, "thu");

    // "I can do Wednesday or Thursday" is the commonest honest answer. A poll that
    // forced a single choice would split it and pick a worse night than either.
    expect(h.stored.map((v) => v.night).sort()).toEqual(["thu", "wed"]);
  });

  it("takes a vote back when the same night is tapped twice", async () => {
    const h = nightHarness();
    await tapNight(h, "sat");
    await tapNight(h, "sat");

    expect(h.stored).toHaveLength(0);
  });

  it("always answers the callback, so the button stops spinning", async () => {
    const h = nightHarness();
    await tapNight(h, "wed");
    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);
  });

  it("ignores a night that is not on the keyboard", async () => {
    // Callback payloads come off the wire and can name anything at all.
    const h = nightHarness();
    await tapNight(h, "mon");

    expect(h.stored).toHaveLength(0);
    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);
  });

  it("does nothing at all when the night poll is not wired up", async () => {
    // ctx.nights is optional, and an unwired bot must acknowledge rather than throw
    // inside a webhook that Telegram will then retry forever.
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 5150,
      callback_query: {
        id: "cb-2",
        chat_instance: "ci-2",
        from: user(999),
        data: "n:wed",
        message: { message_id: 77, chat: { id: GROUP_CHAT, type: "supergroup" }, date: 0 },
      },
    });

    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);
    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
  });
});

describe("/where", () => {
  function sendWhere(h: Harness, text: string) {
    return handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text,
      },
    });
  }

  it("reads the venue back, with a tappable pin", async () => {
    const h = harness();
    await sendWhere(h, "/where");

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(String(sent.params.text)).toContain("Zandvlei Sports Ground");

    // The pin is the whole point of storing coordinates — a name in a message is
    // something you still have to type into a maps app yourself.
    const markup = sent.params.reply_markup as { inline_keyboard: { url?: string }[][] };
    expect(markup.inline_keyboard[0]![0]!.url).toContain("google.com/maps");
  });

  it("moves the game when somebody names a new place", async () => {
    const h = harness();
    await sendWhere(h, "/where Sea Point Prom");

    expect(h.calls).toContain("setVenue:Sea Point Prom");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "Change of venue",
    );
  });

  it("names whoever moved it", async () => {
    // Not for blame. So the one person who knows it is wrong knows who to talk to,
    // and so a mis-tap is visible rather than silent.
    const h = harness();
    await sendWhere(h, "/where The other field");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "Moved by Newbie",
    );
  });

  it("keeps the coordinates out of a full maps link", async () => {
    const h = harness();
    await sendWhere(
      h,
      "/where https://www.google.com/maps/place/X/@-33.9,18.4,17z/data=!4m6!3m5!8m2!3d-33.915!4d18.39",
    );

    expect(h.state.venue?.lat).toBeCloseTo(-33.915, 4);
    expect(h.state.venue?.lon).toBeCloseTo(18.39, 4);
  });

  it("asks again rather than moving the game nowhere", async () => {
    const h = harness();
    await sendWhere(h, "/where    ");

    // An empty argument is a read, not a move — moving the game to "" would wipe the
    // venue for everybody on a stray keystroke.
    expect(h.calls).not.toContain("setVenue:");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "Zandvlei",
    );
  });

  it("announces a move to the group even when it was typed in a DM", async () => {
    // Otherwise the person who moved it is the only one who knows, which is the
    // silent version of the exact mistake this command exists to let anybody correct.
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 999, type: "private" },
        date: 0,
        from: user(999),
        text: "/where Sea Point Prom",
      },
    });

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(sent.params.chat_id).toBe(GROUP_CHAT);
    expect(String(sent.params.text)).toContain("Change of venue");
  });

  it("says there is nothing to move when no game is booked", async () => {
    const h = harness({ fixture: null });
    await sendWhere(h, "/where Sea Point");

    expect(h.calls.some((c) => c.startsWith("setVenue"))).toBe(false);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "No game on the books",
    );
  });
});

describe("naming yourself", () => {
  function say(h: Harness, text: string, chat: TelegramChat = { id: GROUP_CHAT, type: "supergroup" }) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e6),
      message: { message_id: 1, chat, date: 0, from: user(999), text },
    });
  }

  it("changes the name and shows it back the way the sheet will print it", async () => {
    const h = harness();
    await say(h, "/name Daniel G.");

    expect(h.calls).toContain("setDisplayName:Daniel G.");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "⚽ Daniel G.",
    );
  });

  it("takes the whole rest of the line, not just the first word", async () => {
    const h = harness();
    await say(h, "/name Danny  Boy");

    expect(h.calls).toContain("setDisplayName:Danny Boy");
  });

  it("changes the emoji", async () => {
    const h = harness();
    await say(h, "/emoji 🦖");

    expect(h.calls).toContain("setEmoji:🦖");
  });

  it("refuses a bad emoji without touching the player", async () => {
    const h = harness();
    await say(h, "/emoji LFC");

    expect(h.calls.some((c) => c.startsWith("setEmoji"))).toBe(false);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "not an emoji",
    );
  });

  it("refuses a name that would not fit the team sheet", async () => {
    const h = harness();
    await say(h, `/name ${"x".repeat(40)}`);

    expect(h.calls.some((c) => c.startsWith("setDisplayName"))).toBe(false);
  });

  it("sent bare, says what you are called now and how to change it", async () => {
    const h = harness();
    await say(h, "/name");

    const text = String(h.transport.lastCallTo("sendMessage")!.params.text);
    expect(text).toContain("⚽ Newbie");
    expect(text).toContain("/emoji");
    expect(h.calls.some((c) => c.startsWith("setDisplayName"))).toBe(false);
  });

  it("answers in the group without anybody else reading it", async () => {
    const h = harness();
    await say(h, "/name Daniel G.");

    // Renaming yourself mid-poll must not push the squad sheet up fifteen screens.
    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(sent.params.ephemeral_message_parameters).toEqual({ receiver_user_id: 999 });
  });

  it("answers plainly in a private chat, where there is nobody to hide from", async () => {
    const h = harness();
    await say(h, "/name Daniel G.", { id: 999, type: "private" });

    expect(
      h.transport.lastCallTo("sendMessage")!.params.ephemeral_message_parameters,
    ).toBeUndefined();
  });

  it("answers the welcome's button with the same thing the command says", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: {
        id: "cbq-1",
        from: user(999),
        chat_instance: "x",
        data: "e",
        message: { message_id: 5, chat: { id: GROUP_CHAT, type: "supergroup" }, date: 0 },
      },
    });

    const sent = h.transport.lastCallTo("sendMessage")!;
    expect(String(sent.params.text)).toContain("/name");
    // Answering through the ephemeral send is what stops the button spinning.
    expect(sent.params.ephemeral_message_parameters).toEqual({
      receiver_user_id: 999,
      callback_query_id: "cbq-1",
    });
  });
});

describe("commands", () => {
  it("answers /help", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 999, type: "private" }, date: 0, from: user(999), text: "/help" },
    });

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("The league");
  });

  it("strips the @botname suffix a group adds to commands", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: GROUP_CHAT, type: "supergroup" },
        date: 0,
        from: user(999),
        text: "/next@MuizenbergFootballBot",
      },
    });

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("IN — 1/22");
  });

  it("says so plainly when there is no game booked", async () => {
    const h = harness({ fixture: null });
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 999, type: "private" }, date: 0, from: user(999), text: "/next" },
    });

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("No game on the books");
  });
});

describe("the questionnaire, in the group", () => {
  function reportRow(overrides: Partial<MatchReportRow> = {}): MatchReportRow {
    return {
      id: "report-1",
      fixture_id: FIXTURE_ID,
      player_id: "player-1",
      goals: 0,
      assists: 0,
      nutmegs: 0,
      tackles: 0,
      saves: 0,
      own_goals: 0,
      self_rating: null,
      motm_player_id: null,
      reported_goals_for: null,
      reported_goals_against: null,
      flow_state: "not_started",
      flow_message_id: null,
      submitted_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      ...overrides,
    };
  }

  /** A harness whose one report behaves like the real row: answers move it on. */
  function withReport(initial: MatchReportRow | null) {
    // Locked: teams picked, game played, not yet settled — when the post goes out.
    const h = harness({ fixture: fixtureRow({ status: "locked" }) });
    h.ctx.leagueChatId = GROUP_CHAT;
    const store = { report: initial };

    h.ctx.reports = {
      async reportFor() {
        return store.report;
      },
      async openReportForPlayer() {
        return store.report?.submitted_at ? null : store.report;
      },
      async recordAnswer(_id, field, value, next) {
        const column = field === "goals" ? { goals: value } : {};
        store.report = { ...store.report!, ...column, flow_state: next };
        return store.report;
      },
      async recordMotm(_id, motm, next) {
        store.report = { ...store.report!, motm_player_id: motm, flow_state: next };
        return store.report;
      },
      async submitReport() {
        store.report = {
          ...store.report!,
          flow_state: "done",
          submitted_at: NOW.toISOString(),
        };
        return store.report;
      },
      async setFlowState(_id, state, messageId) {
        store.report = {
          ...store.report!,
          flow_state: state,
          flow_message_id: messageId ?? store.report!.flow_message_id,
        };
      },
      async questionContext() {
        return {
          fixtureId: FIXTURE_ID,
          firstName: "Leo",
          teamName: "White",
          opponentName: "Black",
          peers: [{ playerId: "player-2", displayName: "Tom", emoji: "⚽" }],
        };
      },
    };

    return { h, store };
  }

  function tap(h: Harness, action: CallbackAction, chat: TelegramChat, messageId = 500) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: "cb-1",
        from: user(999),
        chat_instance: "x",
        data: encodeCallback(action),
        // What Telegram actually attaches: a message only one person can see has a
        // message_id of 0 and its real id in ephemeral_message_id.
        message:
          chat.type === "private"
            ? { message_id: messageId, chat, date: 0 }
            : { message_id: 0, ephemeral_message_id: messageId, chat, date: 0 },
      },
    });
  }

  const GROUP: TelegramChat = { id: GROUP_CHAT, type: "supergroup" };
  const PRIVATE: TelegramChat = { id: 999, type: "private" };

  it("hands the tapper their first question, visible only to them", async () => {
    const { h, store } = withReport(reportRow());
    // Telegram's real reply to an ephemeral send: message_id is always 0.
    h.transport.reply("sendMessage", {
      message_id: 0,
      ephemeral_message_id: 7311,
      chat: GROUP,
      date: 0,
    });

    await tap(h, { kind: "reportStart", fixtureId: FIXTURE_ID }, GROUP);

    const sent = h.transport.lastCallTo("sendMessage")!.params;
    expect(sent.chat_id).toBe(GROUP_CHAT);
    // The score first: the one answer the result depends on.
    expect(String(sent.text)).toContain("How many goals did your team score");
    // Sent in reply to the tap, which is what guarantees it arrives: somebody who has
    // just pressed a button is online.
    expect(sent.ephemeral_message_parameters).toMatchObject({
      receiver_user_id: 999,
      callback_query_id: "cb-1",
    });
    // The callback id rode on the send, so answering it again would be an error.
    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(0);
    expect(store.report).toMatchObject({ flow_state: "scoreFor", flow_message_id: 7311 });
  });

  it("picks up where they left off rather than starting again", async () => {
    const { h } = withReport(reportRow({ flow_state: "tackles", flow_message_id: 12 }));

    await tap(h, { kind: "reportStart", fixtureId: FIXTURE_ID }, GROUP);

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("Big tackles?");
  });

  it("tells somebody who was not on the sheet, privately", async () => {
    const { h } = withReport(null);

    await tap(h, { kind: "reportStart", fixtureId: FIXTURE_ID }, GROUP);

    expect(h.transport.callsTo("sendMessage")).toHaveLength(0);
    expect(h.transport.lastCallTo("answerCallbackQuery")!.params).toMatchObject({
      show_alert: true,
    });
  });

  it("does not hand out a second questionnaire to somebody who has filed", async () => {
    const { h } = withReport(reportRow({ submitted_at: NOW.toISOString() }));

    await tap(h, { kind: "reportStart", fixtureId: FIXTURE_ID }, GROUP);

    expect(h.transport.callsTo("sendMessage")).toHaveLength(0);
    expect(String(h.transport.lastCallTo("answerCallbackQuery")!.params.text)).toContain(
      "Already logged",
    );
  });

  it("will not start a questionnaire for a game that has already been settled", async () => {
    // Settlement reads reports once. Answers given after it would be stored and never
    // counted, which is the silent loss this whole flow exists to end.
    const { h } = withReport(reportRow());
    h.state.fixture = fixtureRow({ status: "played" });

    await tap(h, { kind: "reportStart", fixtureId: FIXTURE_ID }, GROUP);

    expect(h.transport.callsTo("sendMessage")).toHaveLength(0);
    expect(String(h.transport.lastCallTo("answerCallbackQuery")!.params.text)).toContain(
      "settled",
    );
  });

  it("edits a group answer with the method for messages only one person can see", async () => {
    // editMessageText on one of these fails outright, which would freeze the
    // questionnaire on its first question.
    const { h, store } = withReport(reportRow({ flow_state: "goals", flow_message_id: 7311 }));

    await tap(h, { kind: "report", field: "goals", value: 2, fixtureId: FIXTURE_ID }, GROUP, 7311);

    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
    const edit = h.transport.lastCallTo("editEphemeralMessageText")!.params;
    expect(edit).toMatchObject({
      chat_id: GROUP_CHAT,
      receiver_user_id: 999,
      ephemeral_message_id: 7311,
    });
    expect(String(edit.text)).toContain("Any assists?");
    expect(store.report).toMatchObject({ goals: 2, flow_state: "assists" });
  });

  it("moves on to the next question for somebody whose stored message id is 0", async () => {
    // Every questionnaire handed out before the fix stored Telegram's placeholder 0.
    // The id on the tapped message is the one to edit.
    const { h } = withReport(reportRow({ flow_state: "scoreFor", flow_message_id: 0 }));

    await tap(h, { kind: "report", field: "scoreFor", value: 3, fixtureId: FIXTURE_ID }, GROUP, 7311);

    const edit = h.transport.lastCallTo("editEphemeralMessageText")!.params;
    expect(edit.ephemeral_message_id).toBe(7311);
    expect(String(edit.text)).toContain("And the");
  });

  it("finishes in the group with the summary in place of the last question", async () => {
    const { h, store } = withReport(reportRow({ flow_state: "rating", flow_message_id: 7311 }));

    await tap(h, { kind: "report", field: "rating", value: 8, fixtureId: FIXTURE_ID }, GROUP, 7311);

    expect(store.report!.submitted_at).not.toBeNull();
    expect(h.transport.lastCallTo("editEphemeralMessageText")!.params.reply_markup).toBeUndefined();
  });

  it("still works for an answer tapped in a private chat", async () => {
    const { h } = withReport(reportRow({ flow_state: "goals", flow_message_id: 42 }));

    await tap(h, { kind: "report", field: "goals", value: 1, fixtureId: FIXTURE_ID }, PRIVATE, 42);

    expect(h.transport.callsTo("editEphemeralMessageText")).toHaveLength(0);
    expect(h.transport.lastCallTo("editMessageText")!.params).toMatchObject({
      chat_id: 999,
      message_id: 42,
    });
  });
});

describe("the kickoff time on the Monday poll", () => {
  function tap(h: Harness, data: string) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: "cb-t",
        chat_instance: "ci-1",
        from: user(999),
        data,
        message: { message_id: 77, chat: { id: GROUP_CHAT, type: "supergroup" }, date: 0 },
      },
    });
  }

  /** A December Monday, when the evenings are long enough for a later start. */
  const SUMMER_MONDAY = new Date("2026-12-14T07:00:00Z");

  it("offers no later time while sunset is too early for one", async () => {
    // Mid-September: sunset is about 18:38, so even an 18:00 start ends in the dark.
    const h = harness();
    wireNights(h);
    await tap(h, "n:wed");

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(JSON.stringify(edit.params.reply_markup)).not.toContain("k:");
    expect(String(edit.params.text)).toContain("too early for anything later");
  });

  it("draws the time buttons under the nights", async () => {
    const h = harness();
    h.ctx.now = SUMMER_MONDAY;
    wireNights(h);
    await tap(h, "n:wed");

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(String(edit.params.text)).toContain("17:30");
    const buttons = JSON.stringify(edit.params.reply_markup);
    expect(buttons).toContain("k:1730");
    expect(buttons).toContain("k:1800");
  });

  it("records a time and redraws the poll with its count", async () => {
    const h = harness();
    h.ctx.now = SUMMER_MONDAY;
    wireNights(h);
    await tap(h, "k:1800");

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(edit.params.message_id).toBe(77);
    expect(JSON.stringify(edit.params.reply_markup)).toContain("18:00  ·  1");
    // One vote is not enough to move everybody's evening.
    expect(String(edit.params.text)).toContain("17:30</b> kickoff as usual");
  });

  it("refuses a time that would finish in the dark", async () => {
    // Mid-September: sunset is about 18:38, so a 19:00 start never ends in daylight.
    const h = harness();
    wireNights(h);
    await tap(h, "k:1900");

    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(String(answer.params.text)).toContain("Too dark");
  });

  it("turns a time away once the week has been booked", async () => {
    const h = harness();
    wireNights(h, { ...OPEN_POLL, resolved_at: "2026-09-15T07:00:00Z" });
    await tap(h, "k:1800");

    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
  });
});

describe("bringing a ball", () => {
  function tapBall(h: Harness) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: "cb-b",
        chat_instance: "ci-1",
        from: user(999),
        data: `b:${FIXTURE_ID}`,
        message: { message_id: 42, chat: { id: GROUP_CHAT, type: "supergroup" }, date: 0 },
      },
    });
  }

  it("puts the ball on the squad list, and warns while there is none", async () => {
    const h = harness();
    await tapBall(h);

    const edit = h.transport.lastCallTo("editMessageText")!;
    expect(String(edit.params.text)).toContain("<b>Ball:</b>");
    expect(String(edit.params.text)).toContain("Newbie");

    await tapBall(h);
    const again = h.transport.lastCallTo("editMessageText")!;
    expect(String(again.params.text)).toContain("Nobody's bringing a ball yet");
  });

  it("asks somebody who is not in to say so first, and changes nothing", async () => {
    const h = harness({ rsvps: [rsvpView({ status: "maybe", squad_position: null })] });
    await tapBall(h);

    expect(h.transport.callsTo("editMessageText")).toHaveLength(0);
    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(String(answer.params.text)).toContain("I'm in");
  });

  it("does not count a ball from somebody on the waiting list", async () => {
    const h = harness({ rsvps: [rsvpView({ is_waitlisted: true, bringing_ball: true })] });
    await tapBall(h); // takes it back
    await tapBall(h); // brings it again

    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(String(answer.params.text)).toContain("waiting list");
  });
});
