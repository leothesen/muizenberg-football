import { describe, expect, it } from "vitest";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import type { TelegramUpdate, TelegramUser } from "@/lib/telegram/types";
import type { FixtureRow, FixtureRsvpView, PlayerRow } from "@/lib/repo/mappers";
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
    is_guest: false,
    invited_by: null,
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

describe("bringing a mate who isn't on Telegram", () => {
  function bringHarness() {
    const h = harness();
    const added: { displayName: string; invitedBy: string }[] = [];

    h.ctx.guests = {
      async addGuest(params) {
        added.push(params);
        return playerRow({
          id: `guest-${added.length}`,
          telegram_user_id: null,
          telegram_username: null,
          is_guest: true,
          invited_by: params.invitedBy,
          display_name: params.displayName,
        });
      },
    };

    return { ...h, added };
  }

  function sendBring(h: ReturnType<typeof bringHarness>, text: string) {
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

  it("adds them and counts them in, in one go", async () => {
    // Somebody typing "bringing Dave" has plainly said Dave is coming. Making them
    // RSVP on Dave's behalf as a second step is the kind of friction nobody does.
    const h = bringHarness();
    await sendBring(h, "/bring Dave");

    expect(h.added).toEqual([{ displayName: "Dave", invitedBy: "player-1" }]);
    expect(h.state.setRsvps.at(-1)).toMatchObject({ status: "in" });
  });

  it("says who brought them", async () => {
    // A name on the team sheet with nobody attached is a mystery at six o'clock.
    const h = bringHarness();
    await sendBring(h, "/bring Dave");

    const text = String(h.transport.lastCallTo("sendMessage")!.params.text);
    expect(text).toContain("Dave");
    expect(text).toContain("Newbie");
  });

  it("takes a name with spaces in it", async () => {
    const h = bringHarness();
    await sendBring(h, "/bring Big Dave from work");
    expect(h.added[0]!.displayName).toBe("Big Dave from work");
  });

  it("asks who, rather than adding a nameless player", async () => {
    const h = bringHarness();
    await sendBring(h, "/bring");

    expect(h.added).toHaveLength(0);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "Who are you bringing?",
    );
  });

  it("says there is nothing to bring anyone to when no game is booked", async () => {
    const h = bringHarness();
    h.state.fixture = null;
    await sendBring(h, "/bring Dave");

    expect(h.added).toHaveLength(0);
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "No game on the books",
    );
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

  it("says so plainly when there is no game to call off", async () => {
    const h = harness({ fixture: null });
    await sendOff(h, "/off");
    expect(String(h.transport.lastCallTo("sendMessage")!.params.text)).toContain(
      "No game on the books",
    );
  });
});

describe("voting on the night", () => {
  /** A harness whose night votes live in an array, so a toggle is observable. */
  function nightHarness() {
    const h = harness();
    const stored: { playerId: string; night: string }[] = [];

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
    };

    return { ...h, stored };
  }

  function tapNight(h: ReturnType<typeof nightHarness>, night: string) {
    return handleUpdate(h.ctx, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: "cb-1",
        chat_instance: "ci-1",
        from: user(999),
        data: `n:${night}`,
        message: {
          message_id: 77,
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
