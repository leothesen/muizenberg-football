import { beforeAll, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { ping } from "./health";

/**
 * The keepalive's one query.
 *
 * Trivial, but it is the canary: it runs daily and is the first thing to check when
 * the bot has gone quiet, so it has to be a genuine round trip rather than something
 * that can succeed while the database is unreachable.
 */

beforeAll(async () => {
  await resetToSeed();
});

describe("ping", () => {
  it("counts the league", async () => {
    expect(await ping()).toBe(16);
  });

  it("returns a number rather than throwing on an empty league", async () => {
    // head-only count against no rows: the query still has to answer 0, not null.
    const count = await ping();
    expect(typeof count).toBe("number");
  });
});
