import { describe, expect, it } from "vitest";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import {
  ALLOWED_UPDATES,
  GROUP_COMMANDS,
  PRIVATE_COMMANDS,
  miniAppUrl,
  resolveBotUsername,
  syncCommands,
  webhookUrl,
} from "./registration";

describe("command lists", () => {
  it("asks for chat_member, without which invite-link joins are invisible", () => {
    // The single most important promise this product makes is that joining the group
    // is joining the league. Telegram does not send chat_member unless it is named.
    expect(ALLOWED_UPDATES).toContain("chat_member");
  });

  it("asks for callback_query, without which no button would ever work", () => {
    expect(ALLOWED_UPDATES).toContain("callback_query");
  });

  it("uses lowercase command names, which is all Telegram accepts", () => {
    for (const command of [...GROUP_COMMANDS, ...PRIVATE_COMMANDS]) {
      expect(command.command).toMatch(/^[a-z0-9_]{1,32}$/);
    }
  });

  it("keeps descriptions inside Telegram's 256-character limit", () => {
    for (const command of [...GROUP_COMMANDS, ...PRIVATE_COMMANDS]) {
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(256);
    }
  });

  it("lists no command twice in a scope", () => {
    for (const list of [GROUP_COMMANDS, PRIVATE_COMMANDS]) {
      const names = list.map((c) => c.command);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("advertises only commands the router actually handles", () => {
    const handled = new Set([
      "start",
      "help",
      "next",
      "table",
      "leaders",
      "boards",
      "records",
      "me",
      "card",
      "where",
      "off",
      "rain",
      "game",
      "kickabout",
      "bring",
      "invite",
      "name",
      "emoji",
    ]);

    for (const command of [...GROUP_COMMANDS, ...PRIVATE_COMMANDS]) {
      expect(handled.has(command.command), `${command.command} is advertised`).toBe(true);
    }
  });
});

describe("urls", () => {
  it("builds the Mini App and webhook urls from the site origin", () => {
    expect(miniAppUrl("https://league.example.com")).toBe("https://league.example.com/app");
    expect(webhookUrl("https://league.example.com")).toBe(
      "https://league.example.com/api/telegram/webhook",
    );
  });

  it("does not double a trailing slash", () => {
    expect(miniAppUrl("https://league.example.com/")).toBe("https://league.example.com/app");
  });
});

describe("syncCommands", () => {
  it("sets both scopes, so a group and a private chat each get their own menu", async () => {
    const transport = new RecordingTransport();
    await syncCommands(new TelegramClient(transport));

    const calls = transport.callsTo("setMyCommands");
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => (c.params.scope as { type: string }).type)).toEqual([
      "all_group_chats",
      "all_private_chats",
    ]);
  });

  it("sends the lists as they stand, not a copy that can fall behind", async () => {
    // The whole failure this exists to end: Telegram's menu is a snapshot it holds,
    // and for months it held the six commands from the first version of the list
    // while the bot answered twelve.
    const transport = new RecordingTransport();
    await syncCommands(new TelegramClient(transport));

    const [group, private_] = transport.callsTo("setMyCommands");
    expect(group!.params.commands).toEqual(GROUP_COMMANDS);
    expect(private_!.params.commands).toEqual(PRIVATE_COMMANDS);
  });
});

describe("resolveBotUsername", () => {
  function store(cached: string | null) {
    const remembered: string[] = [];
    return {
      remembered,
      cached: async () => cached,
      remember: async (username: string) => {
        remembered.push(username);
      },
    };
  }

  function bot(me: { username?: string } | Error) {
    return {
      getMe: async () => {
        if (me instanceof Error) throw me;
        return { id: 1, is_bot: true, first_name: "League", ...me };
      },
    };
  }

  it("prefers the configured value, without asking anybody", async () => {
    const s = store("remembered");
    await expect(resolveBotUsername(bot({ username: "asked" }), s, "configured")).resolves.toBe(
      "configured",
    );
    expect(s.remembered).toEqual([]);
  });

  it("reads what was written down last time rather than calling getMe again", async () => {
    const s = store("remembered");
    await expect(resolveBotUsername(bot(new Error("should not be called")), s)).resolves.toBe(
      "remembered",
    );
  });

  it("asks Telegram once and writes the answer down", async () => {
    const s = store(null);
    await expect(resolveBotUsername(bot({ username: "LeagueBot" }), s)).resolves.toBe("LeagueBot");
    expect(s.remembered).toEqual(["LeagueBot"]);
  });

  it("gives up quietly when Telegram will not say", async () => {
    // Losing the username costs a button on the welcome. It must not cost the update
    // that was being handled when the call failed.
    const s = store(null);
    await expect(resolveBotUsername(bot(new Error("offline")), s)).resolves.toBeUndefined();
    expect(s.remembered).toEqual([]);
  });

  it("handles a bot with no username at all", async () => {
    const s = store(null);
    await expect(resolveBotUsername(bot({}), s)).resolves.toBeUndefined();
    expect(s.remembered).toEqual([]);
  });
});
