/**
 * Making a database result stable enough to snapshot.
 *
 * Two things in these rows change on every reset and would make every snapshot fail
 * for reasons that have nothing to do with the code under test:
 *
 *  - **Primary keys.** The seed is deterministic in every value it computes, but ids
 *    come from `gen_random_uuid()`, so they are new each time.
 *  - **Row timestamps.** `created_at` and friends default to `now()`.
 *
 * Ids are replaced with `<uuid-1>`, `<uuid-2>` … in first-seen order rather than
 * being dropped, which keeps the thing that actually matters: whether two rows point
 * at the *same* player. A join that silently pairs the wrong rows still fails.
 *
 * That does make snapshots sensitive to ordering — which is the point. An `order by`
 * lost in translation is exactly the kind of regression this milestone exists to
 * catch.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Columns whose value is `now()` at insert time and therefore never reproducible.
 *
 * `in_since` is the interesting one. The seed sets it deliberately relative to
 * `now()` — "future in_since values would rank ahead of anybody answering during a
 * demo" — so its absolute value changes every reset. Normalising it does not lose
 * the thing it exists for: `in_since` decides the waitlist order, and that order is
 * still visible in the order rows come back in.
 */
const VOLATILE_KEYS = new Set([
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "earned_at",
  "earnedAt",
  "submitted_at",
  "submittedAt",
  "in_since",
  "inSince",
  "responded_at",
  "respondedAt",
  "promoted_at",
  "promotedAt",
]);

export interface Normaliser {
  (value: unknown): unknown;
}

/**
 * Build a normaliser with its own id table.
 *
 * Per-snapshot rather than global, so one test cannot renumber another's ids by
 * running first.
 */
export function normaliser(): Normaliser {
  const ids = new Map<string, string>();

  const tokenFor = (uuid: string): string => {
    const existing = ids.get(uuid);
    if (existing) return existing;

    const token = `<uuid-${ids.size + 1}>`;
    ids.set(uuid, token);
    return token;
  };

  const walk = (value: unknown, key?: string): unknown => {
    if (value === null || value === undefined) return value;

    // Before the generic object branch. A Date has no own enumerable properties, so
    // walking it as an object yields `{}` — which is what this used to do, and it
    // meant a fixture scheduled on entirely the wrong day still matched its
    // snapshot. Dates carry real information here: kickoff times come straight from
    // the seed and must be compared, not flattened.
    if (value instanceof Date) {
      if (key !== undefined && VOLATILE_KEYS.has(key)) return "<timestamp>";
      return value.toISOString();
    }

    if (Array.isArray(value)) return value.map((item) => walk(item));

    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v, k);
      }
      return out;
    }

    if (typeof value === "string") {
      if (key !== undefined && VOLATILE_KEYS.has(key)) return "<timestamp>";
      if (UUID_PATTERN.test(value)) return tokenFor(value);
    }

    return value;
  };

  return (value: unknown) => walk(value);
}

/** Convenience for the common case of normalising one result in one go. */
export function stable(value: unknown): unknown {
  return normaliser()(value);
}

/**
 * Impose a deterministic order on rows that arrive without one.
 *
 * Several of the public queries have no `ORDER BY` — not in the query and not in the
 * view — so Postgres returns them in whatever order the plan happens to produce, and
 * it genuinely differs between runs. That cannot be snapshotted at all until
 * something pins it.
 *
 * Sorting happens here rather than inside the normaliser because the keys have to be
 * business values that survive a reset. Sorting on an id would be useless: ids are
 * regenerated every time.
 */
export function sortRows<T>(rows: readonly T[], ...keys: (keyof T)[]): T[] {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const left = String(a[key] ?? "");
      const right = String(b[key] ?? "");
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  });
}
