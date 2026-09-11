import { beforeEach, describe, expect, it } from "vitest";
import type { TelegramUser } from "@/lib/telegram/types";
import { resetToSeed } from "@/test/db/reset";
import { stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import * as players from "./players";
import { silentPlayers } from "./rsvps";

/**
 * Enrolment and identity.
 *
 * Joining the Telegram group is joining the league: there is no signup form, so
 * `ensurePlayer` is the only door in and every handler calls it. Getting its
 * create-or-update behaviour wrong in the port would either duplicate people or stop
 * new ones appearing at all.
 *
 * These mutate, so the database is reset before each test rather than once for the
 * file — a reset is about 80ms, which is cheaper than reasoning about test order.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

const newcomer: TelegramUser = {
  id: 909090901,
  is_bot: false,
  first_name: "Thandi",
  last_name: "Nkosi",
  username: "thandi",
};

describe("findPlayerByTelegramId", () => {
  it("finds a seeded player", async () => {
    const [seeded] = await rawQuery<{ telegram_user_id: string }>(
      "select telegram_user_id from players order by telegram_user_id limit 1",
    );

    const found = await players.findPlayerByTelegramId(
      Number(seeded!.telegram_user_id),
    );

    expect(found).not.toBeNull();
    expect(stable(found)).toMatchSnapshot();
  });

  it("returns null rather than throwing for somebody who has never played", async () => {
    expect(await players.findPlayerByTelegramId(newcomer.id)).toBeNull();
  });
});

describe("ensurePlayer", () => {
  it("enrols somebody new and says so", async () => {
    const { player, isNew } = await players.ensurePlayer(newcomer);

    expect(isNew).toBe(true);
    expect(stable(player)).toMatchSnapshot();
  });

  it("is idempotent: the second call is not a new player", async () => {
    await players.ensurePlayer(newcomer);
    const { isNew } = await players.ensurePlayer(newcomer);

    expect(isNew).toBe(false);

    const count = await rawQuery<{ n: string }>(
      "select count(*) as n from players where telegram_user_id = $1",
      [newcomer.id],
    );
    expect(count[0]!.n).toBe("1");
  });

  it("records the private chat id when one is offered", async () => {
    await players.ensurePlayer(newcomer, { privateChatId: 55501 });

    const [row] = await rawQuery<{ private_chat_id: string }>(
      "select private_chat_id from players where telegram_user_id = $1",
      [newcomer.id],
    );
    expect(row!.private_chat_id).toBe("55501");
  });

  it("picks up a changed Telegram name on a later call", async () => {
    await players.ensurePlayer(newcomer);
    const { player } = await players.ensurePlayer({
      ...newcomer,
      first_name: "Thandiwe",
      username: "thandiwe",
    });

    expect(player.first_name).toBe("Thandiwe");
    expect(player.telegram_username).toBe("thandiwe");
  });

  it("does not overwrite a display name the player chose themselves", async () => {
    const { player } = await players.ensurePlayer(newcomer);
    await players.setDisplayName(player.id, "T");

    const { player: after } = await players.ensurePlayer({
      ...newcomer,
      first_name: "Thandiwe",
    });

    // The whole point of setDisplayName: Telegram is the source of the name only
    // until somebody says otherwise.
    expect(after.display_name).toBe("T");
  });
});

describe("setDisplayName and setEmoji", () => {
  it("sets a display name", async () => {
    await players.setDisplayName(anchors.playerId, "The Gaffer");

    const [row] = await rawQuery<{ display_name: string }>(
      "select display_name from players where id = $1",
      [anchors.playerId],
    );
    expect(row!.display_name).toBe("The Gaffer");
  });

  it("sets an emoji", async () => {
    await players.setEmoji(anchors.playerId, "🦖");

    const [row] = await rawQuery<{ emoji: string }>(
      "select emoji from players where id = $1",
      [anchors.playerId],
    );
    expect(row!.emoji).toBe("🦖");
  });
});

describe("deactivatePlayer", () => {
  it("marks somebody inactive without deleting their history", async () => {
    const [seeded] = await rawQuery<{ telegram_user_id: string; id: string }>(
      "select id, telegram_user_id from players order by telegram_user_id limit 1",
    );

    const before = await rawQuery<{ n: string }>(
      "select count(*) as n from match_reports where player_id = $1",
      [seeded!.id],
    );

    await players.deactivatePlayer(Number(seeded!.telegram_user_id));

    const [row] = await rawQuery<{ is_active: boolean }>(
      "select is_active from players where id = $1",
      [seeded!.id],
    );
    const after = await rawQuery<{ n: string }>(
      "select count(*) as n from match_reports where player_id = $1",
      [seeded!.id],
    );

    expect(row!.is_active).toBe(false);
    // Leaving the league must not rewrite the record books.
    expect(after[0]!.n).toBe(before[0]!.n);
    expect(Number(after[0]!.n)).toBeGreaterThan(0);
  });

  it("is silent about somebody who was never a player", async () => {
    await expect(
      players.deactivatePlayer(newcomer.id),
    ).resolves.toBeUndefined();
  });
});

describe("addGuest", () => {
  it("creates a player with no Telegram account", async () => {
    const anchors = await loadAnchors();
    const guest = await players.addGuest({
      displayName: "Big Dave",
      invitedBy: anchors.playerId,
    });

    expect(guest.telegram_user_id).toBeNull();
    expect(guest.is_guest).toBe(true);
    expect(guest.invited_by).toBe(anchors.playerId);
  });

  it("keeps two mates with the same name apart", async () => {
    // Two different people called Dave is likelier in a football group than one
    // person being added twice, and the mistakes cost differently: a duplicate is
    // visible on the team sheet and somebody says so, whereas merging two Daves
    // means one is uncounted until eleven people show up for a nine-a-side.
    const anchors = await loadAnchors();
    const first = await players.addGuest({ displayName: "Dave", invitedBy: anchors.playerId });
    const second = await players.addGuest({ displayName: "Dave", invitedBy: anchors.playerId });

    expect(second.id).not.toBe(first.id);
  });

  it("is never chased for an RSVP", async () => {
    // A guest has no Telegram account at all, so a nudge would be a DM to nobody or
    // an ephemeral message addressed to a null user id. The nudge cron reads
    // silentPlayers, and this is the filter that keeps guests out of it.
    const anchors = await loadAnchors();
    const guest = await players.addGuest({
      displayName: "Big Dave",
      invitedBy: anchors.playerId,
    });

    const silent = await silentPlayers(anchors.upcomingFixtureId);
    expect(silent.map((p) => p.id)).not.toContain(guest.id);
  });

  it("cannot be given a Telegram id while still flagged a guest", async () => {
    // The invariant that keeps the two kinds from blurring. Without it a guest could
    // acquire an id without being un-flagged, and would then be skipped by
    // everything that messages real players while looking like one.
    const anchors = await loadAnchors();
    const guest = await players.addGuest({ displayName: "Dave", invitedBy: anchors.playerId });

    await expect(
      rawQuery("update players set telegram_user_id = 424242 where id = $1", [guest.id]),
    ).rejects.toThrow(/players_guest_has_no_telegram_check/);
  });
});
