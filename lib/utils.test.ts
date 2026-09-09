import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges conflicting tailwind classes, last one winning", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe(
      "text-sm font-bold",
    );
  });

  it("keeps a leading space from collapsing two classes into one", () => {
    expect(cn("rounded-card", "bg-hut-blue")).toBe("rounded-card bg-hut-blue");
  });
});
