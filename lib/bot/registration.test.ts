import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPDATES,
  GROUP_COMMANDS,
  PRIVATE_COMMANDS,
  miniAppUrl,
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
