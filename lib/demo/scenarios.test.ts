import { describe, expect, it } from "vitest";
import { CAST, FIXTURE_PLACEHOLDER, SCENARIOS, scenarioById } from "./scenarios";

/**
 * The scripts are data, and a typo in data fails at the worst moment — halfway
 * through a demo, in front of whoever it was being demonstrated to. These are the
 * checks that cost nothing and catch exactly that.
 */

const KNOWN_CAST = new Set<number>(Object.values(CAST));

/** Every action kind the runner in app/api/dev/demo knows how to execute. */
const RUNNABLE = new Set([
  "cron",
  "advance",
  "play",
  "reportAll",
  "join",
  "command",
  "tap",
  "tapAll",
  "viewAs",
  "reset",
]);

/** Every cron the runner has wired up. */
const CRONS = new Set([
  "nights-ask",
  "nights-resolve",
  "rsvp-open",
  "rsvp-nudge",
  "teams-pick",
  "reports-ask",
  "results-settle",
]);

describe("the demo scripts", () => {
  it("offers more than one week to watch", () => {
    expect(SCENARIOS.length).toBeGreaterThan(1);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it.each(SCENARIOS)("$id starts by clearing the chat", (scenario) => {
    // Restart runs step 0 to wipe the board. A scenario whose first step was anything
    // else would replay on top of the last one's mess.
    expect(scenario.steps[0]?.action.kind).toBe("reset");
  });

  it.each(SCENARIOS)("$id only uses actions the runner understands", (scenario) => {
    for (const step of scenario.steps) {
      expect(RUNNABLE.has(step.action.kind), `${step.action.kind}`).toBe(true);

      if (step.action.kind === "cron") {
        expect(CRONS.has(step.action.step), step.action.step).toBe(true);
      }
    }
  });

  it.each(SCENARIOS)("$id narrates every step", (scenario) => {
    // The narration is the product here as much as the messages are. A step with no
    // line leaves a gap in the script where the viewer loses the thread.
    for (const step of scenario.steps) {
      expect(step.narration.length, JSON.stringify(step.action)).toBeGreaterThan(0);
    }
  });

  it.each(SCENARIOS)("$id only names people who exist in the seed", (scenario) => {
    // A tap from an unseeded id silently enrols a brand-new player mid-demo, and the
    // squad quietly grows a stranger.
    for (const step of scenario.steps) {
      const action = step.action;

      if (action.kind === "tapAll") {
        for (const user of action.users) expect(KNOWN_CAST.has(user), `${user}`).toBe(true);
      }
      if (action.kind === "command") {
        expect(KNOWN_CAST.has(action.user), `${action.user}`).toBe(true);
      }
      // `tap` and `join` are exempt: the newcomer scenario turns on somebody who is
      // deliberately not in the seed yet.
    }
  });

  it.each(SCENARIOS)("$id opens a poll before anybody answers one", (scenario) => {
    // A fixture placeholder can only be filled once a fixture exists. Tapping an RSVP
    // before the week is booked resolves to nothing and stops the run dead.
    let booked = false;

    for (const step of scenario.steps) {
      const action = step.action;

      if (
        (action.kind === "cron" && action.step === "nights-resolve") ||
        (action.kind === "command" && action.text.startsWith("/game"))
      ) {
        booked = true;
      }

      const data =
        action.kind === "tap" || action.kind === "tapAll" ? action.data : null;

      if (data?.includes(FIXTURE_PLACEHOLDER)) {
        expect(booked, `${scenario.id} taps a fixture before booking one`).toBe(true);
      }
    }
  });

  it.each(SCENARIOS)("$id picks teams only once the clock has been moved", (scenario) => {
    // The crons are honest about time, so a scenario that books a game five days out
    // and then asks for teams gets a correct refusal and a dead demo.
    let advanced = false;

    for (const step of scenario.steps) {
      if (step.action.kind === "advance") advanced = true;

      if (step.action.kind === "cron" && step.action.step === "teams-pick") {
        expect(advanced, `${scenario.id} picks teams without advancing`).toBe(true);
      }
    }
  });

  it("finds a scenario by id, and says so when there isn't one", () => {
    expect(scenarioById(SCENARIOS[0]!.id)).toBe(SCENARIOS[0]);
    expect(scenarioById("nope")).toBeNull();
  });
});
