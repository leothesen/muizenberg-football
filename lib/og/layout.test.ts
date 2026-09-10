import { describe, expect, it } from "vitest";
import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_ORDER,
  attributeRows,
  barPercent,
  fit,
  listHeight,
  rankLabel,
  visibleRows,
} from "./layout";

describe("barPercent", () => {
  it("maps the ends of the range to 0 and 100", () => {
    expect(barPercent(40, 40, 99)).toBe(0);
    expect(barPercent(99, 40, 99)).toBe(100);
  });

  it("clamps anything outside the range", () => {
    expect(barPercent(10, 40, 99)).toBe(0);
    expect(barPercent(200, 40, 99)).toBe(100);
  });

  it("does not divide by zero on a degenerate range", () => {
    expect(barPercent(50, 50, 50)).toBe(0);
  });
});

describe("attributeRows", () => {
  const attributes = {
    finishing: 80,
    vision: 60,
    flair: 70,
    defending: 50,
    keeping: 40,
    reputation: 99,
  };

  it("keeps a fixed order so two cards can be compared", () => {
    expect(attributeRows(attributes).map((r) => r.key)).toEqual(
      ATTRIBUTE_ORDER.map(([key]) => key),
    );
  });

  it("rescales to the range attributes actually occupy", () => {
    const rows = attributeRows(attributes);
    // 40 is the floor, so its bar is empty rather than 40% full.
    expect(rows.find((r) => r.key === "keeping")?.percent).toBe(0);
    expect(rows.find((r) => r.key === "reputation")?.percent).toBe(100);
  });

  it("agrees with the range the rescaling claims to use", () => {
    const rows = attributeRows({ ...attributes, finishing: ATTRIBUTE_MIN });
    expect(rows[0]?.percent).toBe(0);
    expect(attributeRows({ ...attributes, finishing: ATTRIBUTE_MAX })[0]?.percent).toBe(100);
  });
});

describe("fit", () => {
  it("leaves a short name alone", () => {
    expect(fit("Ann", 10)).toBe("Ann");
  });

  it("cuts a long one and marks it", () => {
    const result = fit("Bartholomew Cumbersome", 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims whitespace before the ellipsis", () => {
    expect(fit("Ann Smith Jones", 10)).toBe("Ann Smith…");
  });

  it("survives a silly limit", () => {
    expect(fit("Anything", 1)).toBe("A…");
  });
});

describe("listHeight", () => {
  it("grows with the number of rows", () => {
    const small = listHeight({ rows: 2, rowHeight: 50, header: 100, footer: 50 });
    const large = listHeight({ rows: 10, rowHeight: 50, header: 100, footer: 50 });
    expect(large - small).toBe(8 * 50);
  });

  it("respects a floor so a one-row image is still a picture", () => {
    expect(listHeight({ rows: 1, rowHeight: 50, header: 100, footer: 50, minHeight: 400 })).toBe(
      400,
    );
  });
});

describe("rankLabel", () => {
  it("medals the top three and numbers the rest", () => {
    expect([1, 2, 3, 4].map(rankLabel)).toEqual(["🥇", "🥈", "🥉", "4"]);
  });
});

describe("visibleRows", () => {
  it("caps the list", () => {
    expect(visibleRows([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
  });

  it("leaves a short list intact", () => {
    expect(visibleRows([1, 2], 3)).toEqual([1, 2]);
  });
});
