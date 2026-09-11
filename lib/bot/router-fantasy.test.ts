import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import type { TelegramUpdate, TelegramUser } from "@/lib/telegram/types";
import type { PlayerRow } from "@/lib/repo/mappers";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type { CareerStatRow, FixtureStatRow } from "@/domain/records";
import { handleUpdate, type BotContext } from "./router";
import type { BotServices } from "./services";
import type { FantasyDeps } from "./fantasy-services";
import { blankCard, buildPlayerCard } from "./fantasy";

/**
 * The league commands.
 *
 * These read a lot and write nothing, so the interesting behaviour is all about
 * where the answer goes: a card belongs to one person and goes out ephemerally in a
 * group, while the table belongs to everybody.
 */

const NOW = new Date("2026-09-17T06:00:00Z");
const GROUP_CHAT = -1001234567890;
const PRIVATE_CHAT = 5150;

function user(id: number, firstName = "Ann"): TelegramUser {
  return { id, is_bot: false, first_name: firstName, username: firstName.toLowerCase() };
}

function playerRow(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: "player-1",
    telegram_user_id: 999,
    telegram_username: "ann",
    is_guest: false,
    invited_by: null,
    first_name: "Ann",
    last_name: null,
    display_name: "Ann",
    emoji: "🦊",
    is_active: true,
    private_chat_id: null,
    rating: 71.2,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function seasonRow(overrides: Partial<SeasonStatRow> & { playerId: string }): SeasonStatRow {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    rating: 65,
    appearances: 4,
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    ownGoals: 0,
    motmVotes: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    avgSelfRating: null,
    ...overrides,
  };
}

const CAREER: CareerStatRow = {
  playerId: "player-1",
  displayName: "Ann",
  emoji: "🦊",
  appearances: 6,
  goals: 9,
  assists: 3,
  nutmegs: 5,
  tackles: 14,
  saves: 2,
  motmVotes: 4,
  rating: 71.2,
};

const FIXTURE_ROWS: FixtureStatRow[] = [
  {
    playerId: "player-1",
    displayName: "Ann",
    emoji: "🦊",
    fixtureId: "w1",
    kickoffAt: new Date("2026-08-12T16:00:00Z"),
    goals: 4,
    assists: 1,
    nutmegs: 2,
    tackles: 3,
    saves: 0,
    motmVotes: 2,
    outcome: "win",
    goalsFor: 7,
    goalsAgainst: 3,
  },
];

interface Harness {
  ctx: BotContext;
  transport: RecordingTransport;
  fantasyCalls: string[];
}

function harness(options: { fantasy?: boolean; seasonRows?: SeasonStatRow[] } = {}): Harness {
  const fantasyCalls: string[] = [];
  const player = playerRow();

  const services = {
    async claimUpdate() {
      return true;
    },
    async ensurePlayer() {
      return { player, isNew: false };
    },
    async findPlayerByTelegramId() {
      return player;
    },
    async deactivatePlayer() {},
    async openFixture() {
      return null;
    },
    async fixtureById() {
      return null;
    },
    async setRsvp() {},
    async listRsvps() {
      return [];
    },
    async commitmentsFor() {
      return [];
    },
    async markPromoted() {},
    async setVenue() {},
    async upcomingFixture() {
      return null;
    },
    async setFixtureStatus() {},
  } satisfies BotServices;

  const fantasy: FantasyDeps = {
    async currentSeason() {
      fantasyCalls.push("currentSeason");
      return { id: "season-1", name: "Spring 2026" };
    },
    async seasonTable() {
      fantasyCalls.push("seasonTable");
      return (
        options.seasonRows ?? [
          seasonRow({ playerId: "player-1", displayName: "Ann", rating: 71.2, goals: 9, wins: 4 }),
          seasonRow({ playerId: "player-2", displayName: "Bob", rating: 63.4, nutmegs: 6 }),
        ]
      );
    },
    async careerTable() {
      fantasyCalls.push("careerTable");
      return [CAREER];
    },
    async fixtureStatRows() {
      fantasyCalls.push("fixtureStatRows");
      return FIXTURE_ROWS;
    },
    async streakInputs() {
      fantasyCalls.push("streakInputs");
      return {
        fixtureIdsOldestFirst: ["w1"],
        byPlayer: new Map([
          [
            "player-1",
            {
              holder: { playerId: "player-1", displayName: "Ann", emoji: "🦊" },
              fixtureIds: new Set(["w1"]),
            },
          ],
        ]),
      };
    },
    async playerCard(p) {
      fantasyCalls.push("playerCard");
      return p.id === CAREER.playerId
        ? buildPlayerCard({
            career: CAREER,
            form: [
              { outcome: "win", delta: 0.8 },
              { outcome: "loss", delta: -0.4 },
            ],
            badges: [{ emoji: "🎩", name: "Hat-trick" }],
          })
        : blankCard(p);
    },
  };

  const transport = new RecordingTransport();
  return {
    transport,
    fantasyCalls,
    ctx: {
      client: new TelegramClient(transport),
      services,
      now: NOW,
      botUsername: "MuizenbergFootballBot",
      ...(options.fantasy === false ? {} : { fantasy }),
    },
  };
}

function command(text: string, chatId = GROUP_CHAT, from = user(999)): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: 1,
      chat: { id: chatId, type: chatId === PRIVATE_CHAT ? "private" : "supergroup" },
      date: 0,
      from,
      text,
    },
  };
}

function sentText(transport: RecordingTransport): string {
  const call = transport.calls.find((c) => c.method === "sendMessage");
  return String((call?.params as { text?: string } | undefined)?.text ?? "");
}

describe("/table", () => {
  it("renders the season table", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/table"));

    const text = sentText(h.transport);
    expect(text).toContain("Spring 2026");
    expect(text).toContain("Ann");
    expect(text).toContain("71.2");
    expect(h.fantasyCalls).toContain("seasonTable");
  });

  it("still answers when the season has no games in it", async () => {
    const h = harness({ seasonRows: [] });
    await handleUpdate(h.ctx, command("/table"));
    expect(sentText(h.transport)).toContain("starts on Wednesday");
  });

  it("works when the command is addressed to the bot by name", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/table@MuizenbergFootballBot"));
    expect(sentText(h.transport)).toContain("Spring 2026");
  });
});

describe("/leaders", () => {
  it("lists the boards somebody is actually on", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/leaders"));

    const text = sentText(h.transport);
    expect(text).toContain("Golden Boot");
    expect(text).toContain("Nutmeg King");
    // Nobody has a save all season, so The Gloves is left off.
    expect(text).not.toContain("The Gloves");
  });

  it("answers to /boards as well", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/boards"));
    expect(sentText(h.transport)).toContain("Leaderboards");
  });
});

describe("/records", () => {
  it("renders the hall of fame", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/records"));

    const text = sentText(h.transport);
    expect(text).toContain("Hall of fame");
    expect(text).toContain("Most goals in a game");
    expect(h.fantasyCalls).toContain("streakInputs");
  });
});

describe("/me", () => {
  it("sends the card ephemerally in the group, so only they see it", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/me"));

    const call = h.transport.calls.find((c) => c.method === "sendMessage");
    const params = call?.params as {
      text?: string;
      ephemeral_message_parameters?: { receiver_user_id?: number };
    };

    expect(params.ephemeral_message_parameters?.receiver_user_id).toBe(999);
    expect(params.text).toContain("Ann");
    expect(params.text).toContain("FIN");
  });

  it("sends it as an ordinary message in a private chat", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/me", PRIVATE_CHAT));

    const call = h.transport.calls.find((c) => c.method === "sendMessage");
    const params = call?.params as { ephemeral_message_parameters?: unknown };
    expect(params.ephemeral_message_parameters).toBeUndefined();
  });

  it("answers to /card too", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/card"));
    expect(h.fantasyCalls).toContain("playerCard");
  });
});

describe("without the fantasy reads wired in", () => {
  it("says so rather than throwing", async () => {
    const h = harness({ fantasy: false });
    await handleUpdate(h.ctx, command("/table"));
    expect(sentText(h.transport)).toBe("Not wired up yet.");
  });
});

describe("with pictures wired in", () => {
  function drawing(options: { failing?: boolean } = {}) {
    const h = harness();
    const rendered: string[] = [];

    h.ctx.pictures = {
      async render() {
        if (options.failing) throw new Error("satori exploded");
        return new Uint8Array([137, 80, 78, 71]);
      },
      async playerCard() {
        rendered.push("playerCard");
        return { element: createElement("div"), size: { width: 10, height: 10 } };
      },
      async leaderboard() {
        rendered.push("leaderboard");
        return { element: createElement("div"), size: { width: 10, height: 10 } };
      },
      welcome() {
        rendered.push("welcome");
        return { element: createElement("div"), size: { width: 10, height: 10 } };
      },
    };

    return { ...h, rendered };
  }

  it("sends the table as a photo with a short caption", async () => {
    const h = drawing();
    await handleUpdate(h.ctx, command("/table"));

    const call = h.transport.calls.find((c) => c.method === "sendPhoto");
    const params = call?.params as { caption?: string; photo?: unknown };

    expect(call).toBeDefined();
    expect(params.photo).toBeInstanceOf(Uint8Array);
    expect(params.caption).toContain("Spring 2026");
    // The caption is the headline, not the whole table.
    expect(params.caption).not.toContain("🥈");
  });

  it("sends a card as a photo that only the person who asked can see", async () => {
    const h = drawing();
    await handleUpdate(h.ctx, command("/me"));

    const call = h.transport.calls.find((c) => c.method === "sendPhoto");
    const params = call?.params as {
      ephemeral_message_parameters?: { receiver_user_id?: number };
    };

    expect(params.ephemeral_message_parameters?.receiver_user_id).toBe(999);
  });

  it("does not make a card ephemeral in a private chat", async () => {
    const h = drawing();
    await handleUpdate(h.ctx, command("/me", PRIVATE_CHAT));

    const call = h.transport.calls.find((c) => c.method === "sendPhoto");
    const params = call?.params as { ephemeral_message_parameters?: unknown };
    expect(params.ephemeral_message_parameters).toBeUndefined();
  });

  it("still answers with the full text when the render fails", async () => {
    const h = drawing({ failing: true });
    await handleUpdate(h.ctx, command("/table"));

    expect(h.transport.calls.some((c) => c.method === "sendPhoto")).toBe(false);
    const text = sentText(h.transport);
    expect(text).toContain("Spring 2026");
    expect(text).toContain("🥇");
  });

  it("keeps a failed card private rather than leaking it to the group", async () => {
    const h = drawing({ failing: true });
    await handleUpdate(h.ctx, command("/me"));

    const call = h.transport.calls.find((c) => c.method === "sendMessage");
    const params = call?.params as {
      ephemeral_message_parameters?: { receiver_user_id?: number };
    };
    expect(params.ephemeral_message_parameters?.receiver_user_id).toBe(999);
  });
});

describe("inline mode", () => {
  function inlineUpdate(text: string): TelegramUpdate {
    return {
      update_id: Math.floor(Math.random() * 1_000_000),
      inline_query: {
        id: "iq-1",
        from: user(999),
        query: text,
        offset: "",
        chat_type: "group",
      },
    };
  }

  it("answers a query from a chat the bot has never been added to", async () => {
    const h = harness();
    await handleUpdate(h.ctx, inlineUpdate("table"));

    const call = h.transport.calls.find((c) => c.method === "answerInlineQuery");
    const params = call?.params as {
      inline_query_id?: string;
      results?: { input_message_content: { message_text: string } }[];
    };

    expect(params.inline_query_id).toBe("iq-1");
    expect(params.results?.[0]?.input_message_content.message_text).toContain("Spring 2026");
  });

  it("answers with nothing rather than leaving the spinner going", async () => {
    // Telegram shows a loading state until the query is answered, so even an
    // unanswerable one gets an answer.
    const h = harness({ fantasy: false });
    await handleUpdate(h.ctx, inlineUpdate("table"));

    const call = h.transport.calls.find((c) => c.method === "answerInlineQuery");
    expect((call?.params as { results?: unknown[] }).results).toEqual([]);
  });

  it("does not send a message into any chat", async () => {
    const h = harness();
    await handleUpdate(h.ctx, inlineUpdate("table"));
    expect(h.transport.calls.some((c) => c.method === "sendMessage")).toBe(false);
  });
});

describe("unknown commands", () => {
  it("stays quiet in a group, where it was probably meant for another bot", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/weather"));
    expect(h.transport.calls).toHaveLength(0);
  });

  it("offers help in a private chat, where silence looks broken", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/weather", PRIVATE_CHAT));

    const text = sentText(h.transport);
    expect(text).toContain("/weather");
    expect(text).toContain("/table");
  });

  it("escapes a command that is trying to be HTML", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/<b>hack", PRIVATE_CHAT));

    const text = sentText(h.transport);
    expect(text).not.toContain("<b>hack");
    expect(text).toContain("&lt;b&gt;hack");
  });
});

describe("/help", () => {
  it("advertises the new commands", async () => {
    const h = harness();
    await handleUpdate(h.ctx, command("/help"));

    const text = sentText(h.transport);
    expect(text).toContain("/table");
    expect(text).toContain("/leaders");
    expect(text).toContain("/me");
    expect(text).toContain("/records");
  });
});
