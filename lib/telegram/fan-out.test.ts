import { describe, expect, it, vi } from "vitest";
import { TelegramApiError } from "./client";
import { fanOut } from "./fan-out";

const noSleep = async () => {};

describe("fanOut", () => {
  it("delivers to everyone and reports what got through", async () => {
    const result = await fanOut(["a", "b", "c"], async (item) => item, { sleep: noSleep });

    expect(result.delivered).toEqual(["a", "b", "c"]);
    expect(result.failed).toBe(0);
    expect(result.throttled).toBe(false);
  });

  it("paces the sends rather than firing them all at once", async () => {
    const waits: number[] = [];
    await fanOut(["a", "b", "c"], async (item) => item, {
      gapMs: 60,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    // A gap between each pair, and none before the first.
    expect(waits).toEqual([60, 60]);
  });

  it("counts a null as somebody there was no way to reach", async () => {
    const result = await fanOut(["a", "b"], async (item) => (item === "a" ? null : item), {
      sleep: noSleep,
    });

    expect(result.unreachable).toBe(1);
    expect(result.delivered).toEqual(["b"]);
  });

  it("treats a 403 as unreachable, not as a failure", async () => {
    // Somebody blocked the bot or never opened a chat with it. Nothing is broken.
    const result = await fanOut(
      ["a", "b"],
      async (item) => {
        if (item === "a") throw new TelegramApiError("sendMessage", 403, "bot was blocked");
        return item;
      },
      { sleep: noSleep },
    );

    expect(result.unreachable).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.delivered).toEqual(["b"]);
  });

  it("keeps going after an ordinary failure", async () => {
    const result = await fanOut(
      ["a", "b", "c"],
      async (item) => {
        if (item === "b") throw new Error("something went wrong");
        return item;
      },
      { sleep: noSleep },
    );

    expect(result.delivered).toEqual(["a", "c"]);
    expect(result.failed).toBe(1);
  });

  it("stops on a rate limit and says how many were left unasked", async () => {
    const send = vi.fn(async (item: string) => {
      if (item === "b") throw new TelegramApiError("sendMessage", 429, "Too Many Requests", 30);
      return item;
    });

    const result = await fanOut(["a", "b", "c", "d"], send, { sleep: noSleep });

    expect(result.throttled).toBe(true);
    expect(result.delivered).toEqual(["a"]);
    // b, c and d never made it — pressing on would only deepen the hole.
    expect(result.failed).toBe(3);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reports every error to the caller", async () => {
    const seen: number[] = [];
    await fanOut(
      ["a", "b", "c"],
      async (item) => {
        if (item !== "b") throw new Error("nope");
        return item;
      },
      { sleep: noSleep, onError: (_error, index) => seen.push(index) },
    );

    expect(seen).toEqual([0, 2]);
  });

  it("handles an empty list without sleeping or failing", async () => {
    const sleep = vi.fn(async () => {});
    const result = await fanOut([], async (item) => item, { sleep });

    expect(result).toEqual({ delivered: [], unreachable: 0, failed: 0, throttled: false });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("passes the index through, for callers that number their sends", async () => {
    const result = await fanOut(["a", "b"], async (item, index) => `${index}:${item}`, {
      sleep: noSleep,
    });
    expect(result.delivered).toEqual(["0:a", "1:b"]);
  });
});
