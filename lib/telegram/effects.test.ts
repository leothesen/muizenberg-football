import { describe, expect, it } from "vitest";
import {
  RecordingTransport,
  TelegramApiError,
  TelegramClient,
  type TelegramTransport,
} from "./client";
import { effectForReport, effectId, MESSAGE_EFFECTS } from "./effects";

describe("effect ids", () => {
  it("are all numeric strings, which is the shape Telegram expects", () => {
    for (const [name, id] of Object.entries(MESSAGE_EFFECTS)) {
      expect(id, name).toMatch(/^\d+$/);
    }
  });

  it("are distinct", () => {
    const ids = Object.values(MESSAGE_EFFECTS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("effectForReport", () => {
  it("saves fire for a hat-trick", () => {
    expect(effectForReport({ goals: 3, badges: 0, ownGoals: 0 })).toBe("fire");
  });

  it("throws a party for a new badge", () => {
    expect(effectForReport({ goals: 1, badges: 1, ownGoals: 0 })).toBe("party");
  });

  it("has something rude for an own goal", () => {
    expect(effectForReport({ goals: 0, badges: 0, ownGoals: 1 })).toBe("poo");
  });

  it("still says well done for an ordinary night", () => {
    expect(effectForReport({ goals: 0, badges: 0, ownGoals: 0 })).toBe("thumbsUp");
  });

  it("lets the biggest thing win", () => {
    // A hat-trick and an own goal in the same game is a fire night, not a poo one.
    expect(effectForReport({ goals: 4, badges: 1, ownGoals: 1 })).toBe("fire");
  });
});

/** Fails the first call and then behaves, so the retry path can be observed. */
class FlakyTransport implements TelegramTransport {
  readonly inner = new RecordingTransport();
  private failed = false;

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.failed) {
      this.failed = true;
      throw new TelegramApiError(method, 400, "MESSAGE_EFFECT_ID_INVALID");
    }
    return this.inner.call<T>(method, params);
  }
}

describe("sendWithEffect", () => {
  it("sends with the effect when Telegram accepts it", async () => {
    const transport = new RecordingTransport();
    const result = await new TelegramClient(transport).sendWithEffect({
      chat_id: 5150,
      text: "Filed. Nice one.",
      message_effect_id: effectId("fire"),
    });

    expect(result.effectApplied).toBe(true);
    expect(transport.calls).toHaveLength(1);
    expect(
      (transport.calls[0]?.params as { message_effect_id?: string }).message_effect_id,
    ).toBe(effectId("fire"));
  });

  it("retries without the effect rather than losing the message", async () => {
    // The ids are not in the API reference; they are client constants that could be
    // retired without notice, and an unknown one fails the whole send. A bit of
    // confetti must never cost somebody the message it was decorating.
    const transport = new FlakyTransport();
    const result = await new TelegramClient(transport).sendWithEffect({
      chat_id: 5150,
      text: "Filed. Nice one.",
      message_effect_id: "not-a-real-effect",
    });

    expect(result.effectApplied).toBe(false);
    expect(transport.inner.calls).toHaveLength(1);

    const params = transport.inner.calls[0]?.params as { message_effect_id?: string };
    expect(params.message_effect_id).toBeUndefined();
    expect((params as unknown as { text: string }).text).toBe("Filed. Nice one.");
  });
});
