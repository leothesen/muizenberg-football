import { beforeEach, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import * as reports from "./reports";

/**
 * The Wednesday-night questionnaire.
 *
 * One row per player per fixture, filled in a question at a time over Telegram. The
 * flow state is stored rather than inferred, so a player can walk away halfway and
 * pick up where they left off — which means the port has to keep partial rows
 * partial rather than helpfully defaulting them.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

describe("ensureReport and reportFor", () => {
  it("creates a report the first time and reuses it after", async () => {
    const first = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );
    const second = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    expect(second.id).toBe(first.id);

    const [count] = await rawQuery<{ n: string }>(
      "select count(*) as n from match_reports where fixture_id = $1 and player_id = $2",
      [anchors.upcomingFixtureId, anchors.playerId],
    );
    expect(count!.n).toBe("1");
  });

  it("a new report starts empty and not started", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    expect(stable(report)).toMatchSnapshot();
  });

  it("reportFor is null before anyone has been asked", async () => {
    expect(
      await reports.reportFor(anchors.upcomingFixtureId, anchors.playerId),
    ).toBeNull();
  });

  it("reportFor finds a seeded report", async () => {
    const report = await reports.reportFor(
      anchors.playedFixtureId,
      anchors.playerId,
    );
    expect(report).not.toBeNull();
    expect(stable(report)).toMatchSnapshot();
  });
});

describe("recordAnswer", () => {
  it("stores a value and advances the flow", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    const after = await reports.recordAnswer(report.id, "goals", 3, "assists");

    expect(after.goals).toBe(3);
    expect(after.flow_state).toBe("assists");
  });

  it("keeps the rest of the answers untouched", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    await reports.recordAnswer(report.id, "goals", 2, "assists");
    const after = await reports.recordAnswer(
      report.id,
      "nutmegs",
      5,
      "tackles",
    );

    // Answering a later question must not wipe an earlier one — a player who walks
    // away mid-flow comes back to what they already said.
    expect(after.goals).toBe(2);
    expect(after.nutmegs).toBe(5);
  });

  it("maps the score fields onto the reported columns", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    await reports.recordAnswer(report.id, "scoreFor", 9, "scoreAgainst");
    const after = await reports.recordAnswer(
      report.id,
      "scoreAgainst",
      8,
      "motm",
    );

    expect(after.reported_goals_for).toBe(9);
    expect(after.reported_goals_against).toBe(8);
  });
});

describe("recordMotm", () => {
  it("records a vote for somebody else", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    const after = await reports.recordMotm(
      report.id,
      anchors.otherPlayerId,
      "rating",
    );

    expect(after.motm_player_id).toBe(anchors.otherPlayerId);
    expect(after.flow_state).toBe("rating");
  });

  it("refuses a vote for yourself", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    // Enforced by a check constraint rather than by the application, so it holds
    // however the row is written.
    await expect(
      reports.recordMotm(report.id, anchors.playerId, "rating"),
    ).rejects.toThrow();
  });
});

describe("setFlowState and openReportForPlayer", () => {
  it("openReportForPlayer finds a report still being filled in", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );
    await reports.setFlowState(report.id, "goals", 4242);

    const open = await reports.openReportForPlayer(anchors.playerId);
    expect(open?.id).toBe(report.id);
    expect(open?.flow_message_id).toBe(4242);
  });

  it("openReportForPlayer is null once the report is submitted", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );
    await reports.setFlowState(report.id, "goals");
    await reports.submitReport(report.id);

    expect(await reports.openReportForPlayer(anchors.playerId)).toBeNull();
  });
});

describe("submitReport and submittedReports", () => {
  it("submitting stamps the row", async () => {
    const report = await reports.ensureReport(
      anchors.upcomingFixtureId,
      anchors.playerId,
    );

    const submitted = await reports.submitReport(report.id);

    expect(submitted.submitted_at).not.toBeNull();
    expect(submitted.flow_state).toBe("done");
  });

  it("submittedReports lists a played fixture", async () => {
    const rows = await reports.submittedReports(anchors.playedFixtureId);
    expect(rows.length).toBeGreaterThan(0);

    // Sorted by the player's name, not their id: ids are regenerated on every reset,
    // so ordering by them shuffles the whole snapshot between runs.
    const names = new Map(
      (
        await rawQuery<{ id: string; display_name: string }>(
          "select id, display_name from players",
        )
      ).map((p) => [p.id, p.display_name]),
    );

    const ordered = [...rows].sort((a, b) =>
      (names.get(a.player_id) ?? "").localeCompare(
        names.get(b.player_id) ?? "",
      ),
    );

    expect(stable(ordered)).toMatchSnapshot();
  });

  it("submittedReports ignores reports nobody has finished", async () => {
    await reports.ensureReport(anchors.upcomingFixtureId, anchors.playerId);

    // Started but not submitted: settlement must not count a half-filled report.
    expect(await reports.submittedReports(anchors.upcomingFixtureId)).toEqual(
      [],
    );
  });
});
