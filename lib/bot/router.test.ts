import { describe, expect, it } from "vitest";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import type { TelegramUpdate, TelegramUser } from "@/lib/telegram/types";
import type { FixtureRow, FixtureRsvpView, PlayerRow } from "@/lib/repo/mappers";
import { handleUpdate, updateKind, type BotContext } from "./router";
import type { BotServices } from "./services";

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
    preferred_position: "anywhere",
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
    venue: "Muizenberg",
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
    async commitmentsFor() {
      return [];
    },
    async markPromoted(_fixtureId, playerIds) {
      calls.push(`markPromoted:${playerIds.length}`);
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

  it("offers a deep link so the bot can message them later", async () => {
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

    const markup = h.transport.lastCallTo("sendMessage")!.params.reply_markup as {
      inline_keyboard: { text: string; url?: string }[][];
    };
    const urls = markup.inline_keyboard.flat().map((b) => b.url).filter(Boolean);
    expect(urls[0]).toBe("https://t.me/MuizenbergFootballBot?start=join");
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

  it("answers the tap privately with where they stand", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: `r:i:${FIXTURE_ID}` },
    });

    const answer = h.transport.lastCallTo("answerCallbackQuery")!;
    expect(answer.params.callback_query_id).toBe("cbq-1");
    expect(String(answer.params.text)).toContain("You're in");
    // Callback answers are plain text, never HTML.
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

  it("acknowledges an unrecognised button rather than leaving it spinning", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      callback_query: { id: "cbq-1", from: user(999), chat_instance: "x", data: "garbage" },
    });

    expect(h.transport.callsTo("answerCallbackQuery")).toHaveLength(1);
  });
});

describe("commands", () => {
  it("answers /help", async () => {
    const h = harness();
    await handleUpdate(h.ctx, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 999, type: "private" }, date: 0, from: user(999), text: "/help" },
    });

    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain("Wednesday League");
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
