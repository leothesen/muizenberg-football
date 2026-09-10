import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, readPublic, resetDb } from "./index";

/**
 * The seam, against a real Neon-shaped Postgres.
 *
 * This is the milestone's whole point: the writer can write, the public reader
 * cannot, and the reader's privileges do not survive the transaction that granted
 * them. The last one matters most — a `set role` that leaked would hand every
 * subsequent query on a pooled connection the wrong identity, which is a far worse
 * bug than the one this design prevents.
 */

const LOCAL_URL =
  process.env.NEON_SHAPED_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54332/muizenberg";

let previousUrl: string | undefined;

beforeAll(() => {
  previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LOCAL_URL;
  resetDb();
});

afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  resetDb();
});

describe("db()", () => {
  it("connects as the owner and can read a base table", async () => {
    const rows = await db().execute<{ n: string }>(
      sql`select count(*)::text as n from players`,
    );

    expect(Number(rows.rows[0]!.n)).toBe(16);
  });

  it("memoises the handle", () => {
    expect(db()).toBe(db());
  });
});

describe("readPublic()", () => {
  it("can read a curated view", async () => {
    const count = await readPublic(async (tx) => {
      const rows = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from v_players_public`,
      );
      return Number(rows.rows[0]!.n);
    });

    expect(count).toBe(16);
  });

  /**
   * Drizzle wraps a failing query as "Failed query: ..." and puts the Postgres error
   * underneath as `cause`. Asserting on the top-level message alone would pass for
   * any failure at all — a typo in a column name included — so the whole chain is
   * flattened and the actual reason checked.
   */
  async function reasonFor(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      throw new Error("expected the query to be refused, but it succeeded");
    } catch (error) {
      const parts: string[] = [];
      let current: unknown = error;
      while (current instanceof Error) {
        parts.push(current.message);
        current = (current as { cause?: unknown }).cause;
      }
      return parts.join(" | ");
    }
  }

  it("is refused a base table", async () => {
    const reason = await reasonFor(
      readPublic(async (tx) =>
        tx.execute(sql`select telegram_user_id from players limit 1`),
      ),
    );

    expect(reason).toMatch(/permission denied for table players/i);
  });

  it("is refused a write", async () => {
    const reason = await reasonFor(
      readPublic(async (tx) =>
        tx.execute(
          sql`insert into bot_state (key, value) values ('x', '{}'::jsonb)`,
        ),
      ),
    );

    expect(reason).toMatch(/permission denied for table bot_state/i);
  });

  it("actually becomes web_reader rather than silently staying the owner", async () => {
    const who = await readPublic(async (tx) => {
      const rows = await tx.execute<{ role: string }>(
        sql`select current_user as role`,
      );
      return rows.rows[0]!.role;
    });

    // Without this the two tests above could pass for the wrong reason — a typo in
    // the role name would make `set local role` throw, and a test asserting only
    // "rejects" cannot tell that apart from a permission denial.
    expect(who).toBe("web_reader");
  });

  it("drops the role again, so a pooled connection is not left restricted", async () => {
    await readPublic(async (tx) => tx.execute(sql`select 1`));

    // Same handle, same underlying pool. If `set local` had leaked, this would be
    // permission denied.
    const rows = await db().execute<{ n: string }>(
      sql`select count(*)::text as n from players`,
    );
    expect(Number(rows.rows[0]!.n)).toBe(16);
  });

  it("does not leave the role set after a failure either", async () => {
    await expect(
      readPublic(async (tx) => tx.execute(sql`select * from players`)),
    ).rejects.toThrow();

    // A rolled-back transaction has to release the role as cleanly as a committed
    // one, or one denied page render would poison the connection for everything
    // after it.
    const rows = await db().execute<{ n: string }>(
      sql`select count(*)::text as n from players`,
    );
    expect(Number(rows.rows[0]!.n)).toBe(16);
  });
});
