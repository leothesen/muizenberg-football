import { splitSquad, squadHealth } from "@/domain/squad";
import { escapeHtml } from "./format";
import type { TelegramClient } from "@/lib/telegram/client";
import { decodeCallback } from "@/lib/telegram/callbacks";
import {
  PRESENT_STATUSES,
  type InlineKeyboardMarkup,
  type TelegramChatMemberUpdated,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/telegram/types";
import { allLeaderboards, ratingTable } from "@/domain/leaderboards";
import { hallOfFame, longestStreak } from "@/domain/records";
import { buildInlineAnswer } from "./inline";
import {
  rsvpAcknowledgement,
  rsvpKeyboard,
  shareButton,
  squadMessage,
  venueButton,
  venueChangedMessage,
  venueMessage,
  type FixtureLike,
} from "./messages";
import { parseVenue, resolveShortMapsLink, venueOfFixture } from "@/domain/venues";
import { nightByKey, resolveNights, weekStart } from "@/domain/nights";
import {
  nightPollKeyboard,
  nightPollMessage,
  nightVoteAcknowledgement,
} from "./night-poll";
import type { FantasyDeps } from "./fantasy-services";
import { sendIllustrated, type Illustration } from "./illustrate";
import type { PictureDeps } from "./pictures";
import {
  leaderboardMessage,
  playerCardCaption,
  playerCardMessage,
  recordsMessage,
  tableCaption,
  tableMessage,
} from "./results";
import { handleReportAction, type ReportDeps } from "./report-handler";
import {
  startDeepLink,
  welcomeBackMessage,
  welcomeCaption,
  welcomeKeyboard,
  welcomeMessage,
} from "./onboarding";
import type { BotServices } from "./services";
import { shapeOf } from "@/lib/repo/rsvps";
import type { FixtureRow, FixtureRsvpView } from "@/lib/repo/mappers";
import { toCommitments } from "@/lib/repo/mappers";

export interface BotContext {
  client: TelegramClient;
  services: BotServices;
  now: Date;
  botUsername?: string;
  miniAppUrl?: string;
  /** Absent in tests that do not exercise the post-match questionnaire. */
  reports?: ReportDeps;
  /** Absent in tests that do not exercise the league commands. */
  fantasy?: FantasyDeps;
  /** Absent when the bot should answer in text only. */
  pictures?: PictureDeps;
  /** Absent in tests that do not exercise Monday's which-night poll. */
  nights?: NightDeps;
}

/**
 * Reading and writing votes on which night to play.
 *
 * Its own seam rather than more BotServices, because the night poll is the one part
 * of the bot that has nothing to do with a fixture: it runs before any fixture for
 * that week exists, and it is what decides when one will.
 */
export interface NightDeps {
  toggleNightVote(params: {
    weekStart: string;
    playerId: string;
    night: string;
  }): Promise<{ voted: boolean }>;
  votesForWeek(weekStart: string): Promise<{ night: string }[]>;
}

/** Names the update type, for the de-duplication log and for routing. */
export function updateKind(update: TelegramUpdate): string {
  if (update.callback_query) return "callback_query";
  if (update.inline_query) return "inline_query";
  if (update.chat_member) return "chat_member";
  if (update.my_chat_member) return "my_chat_member";
  if (update.edited_message) return "edited_message";
  if (update.message) return "message";
  return "unknown";
}

/**
 * The single entry point for everything Telegram sends.
 *
 * Two rules hold throughout: an update is processed at most once, and a handler that
 * throws must not take the webhook down with it. Telegram retries any non-2xx
 * response, so an unhandled error would become an infinite redelivery loop.
 */
export async function handleUpdate(ctx: BotContext, update: TelegramUpdate): Promise<void> {
  const kind = updateKind(update);

  const claimed = await ctx.services.claimUpdate(update.update_id, kind);
  if (!claimed) return;

  if (update.callback_query) {
    await handleCallbackQuery(ctx, update.callback_query);
    return;
  }

  if (update.inline_query) {
    await handleInlineQuery(ctx, update.inline_query);
    return;
  }

  if (update.chat_member) {
    await handleMembershipChange(ctx, update.chat_member);
    return;
  }

  if (update.message) {
    await handleMessage(ctx, update.message);
  }
}

async function handleMessage(ctx: BotContext, message: TelegramMessage): Promise<void> {
  // Somebody was added to the group, or joined by link.
  if (message.new_chat_members?.length) {
    for (const member of message.new_chat_members) {
      if (member.is_bot) continue;
      await greetNewMember(ctx, message.chat.id, member);
    }
    return;
  }

  if (message.left_chat_member && !message.left_chat_member.is_bot) {
    await ctx.services.deactivatePlayer(message.left_chat_member.id);
    return;
  }

  // Any private message is also the moment we learn their private chat id, which is
  // what makes post-match questions possible later.
  if (message.chat.type === "private" && message.from) {
    await ctx.services.ensurePlayer(message.from, { privateChatId: message.chat.id });
  }

  const text = message.text?.trim();
  if (!text?.startsWith("/")) return;

  await handleCommand(ctx, message, text);
}

/**
 * `chat_member` only arrives if it was named in setWebhook(allowed_updates); it is
 * not sent by default. It is the more reliable signal than the service message,
 * because it also fires when somebody joins via an invite link.
 */
async function handleMembershipChange(
  ctx: BotContext,
  change: TelegramChatMemberUpdated,
): Promise<void> {
  const wasPresent = PRESENT_STATUSES.has(change.old_chat_member.status);
  const isPresent = PRESENT_STATUSES.has(change.new_chat_member.status);
  const user = change.new_chat_member.user;

  if (user.is_bot) return;

  if (!wasPresent && isPresent) {
    await greetNewMember(ctx, change.chat.id, user);
    return;
  }

  if (wasPresent && !isPresent) {
    await ctx.services.deactivatePlayer(user.id);
  }
}

async function greetNewMember(
  ctx: BotContext,
  chatId: number,
  user: TelegramUser,
): Promise<void> {
  const { player, isNew } = await ctx.services.ensurePlayer(user);

  if (!isNew) {
    await ctx.client.sendEphemeral(chatId, user.id, welcomeBackMessage(user.first_name));
    return;
  }

  const fixture = await ctx.services.openFixture();
  const needsPrivateChat = player.private_chat_id === null;

  // Illustrated, because "you are in the league" raises the obvious question of what
  // that involves, and three panels answer it faster than the paragraph underneath
  // them. Ephemeral still: the picture appears in the group but only to the newcomer,
  // so nobody who joined last year sees the explainer again.
  await sendPicture(
    ctx,
    {
      chatId,
      text: welcomeMessage({
        firstName: user.first_name,
        nextKickoffAt: fixture ? new Date(fixture.kickoff_at) : null,
        now: ctx.now,
        needsPrivateChat,
      }),
      caption: welcomeCaption(user.first_name),
      receiverUserId: user.id,
      replyMarkup: welcomeKeyboard({
        miniAppUrl: ctx.miniAppUrl,
        startDeepLink: ctx.botUsername ? startDeepLink(ctx.botUsername) : undefined,
        needsPrivateChat,
      }),
    },
    ctx.pictures ? ctx.pictures.welcome() : null,
  );
}

async function handleCommand(
  ctx: BotContext,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  // "/next@LeagueBot extra" -> "next"
  const command = text.split(/\s+/)[0]!.slice(1).split("@")[0]!.toLowerCase();

  if (message.from) {
    await ctx.services.ensurePlayer(
      message.from,
      message.chat.type === "private" ? { privateChatId: message.chat.id } : {},
    );
  }

  switch (command) {
    case "start":
    case "help":
      await ctx.client.sendMessage({
        chat_id: message.chat.id,
        text: helpText(),
        parse_mode: "HTML",
      });
      return;

    case "next":
      await sendNextFixture(ctx, message.chat.id);
      return;

    case "table":
      await sendTable(ctx, message.chat.id);
      return;

    case "leaders":
    case "boards":
      await sendLeaderboards(ctx, message.chat.id);
      return;

    case "records":
      await sendRecords(ctx, message.chat.id);
      return;

    case "me":
    case "card":
      await sendPlayerCard(ctx, message);
      return;

    case "where":
      await handleWhere(ctx, message, text);
      return;

    default:
      // In a group, an unknown command is almost always meant for a different bot,
      // so saying anything would be noise. In a private chat it is meant for us, and
      // silence looks broken.
      if (message.chat.type === "private") {
        await ctx.client.sendMessage({
          chat_id: message.chat.id,
          text: `I don't know <b>/${escapeHtml(command)}</b>. Here's what I do know:\n\n${helpText()}`,
          parse_mode: "HTML",
        });
      }
      return;
  }
}

/**
 * Inline mode, which works in chats the bot has never been added to.
 *
 * Telegram expects an answer to every inline query and shows a spinner until it gets
 * one, so a query that cannot be answered is still answered — with nothing — rather
 * than dropped.
 */
async function handleInlineQuery(
  ctx: BotContext,
  query: NonNullable<TelegramUpdate["inline_query"]>,
): Promise<void> {
  if (!ctx.fantasy) {
    await ctx.client.answerInlineQuery({ inline_query_id: query.id, results: [] });
    return;
  }

  const season = await ctx.fantasy.currentSeason();
  const [seasonRows, careerRows, fixtureRows, streaks] = await Promise.all([
    season ? ctx.fantasy.seasonTable(season.id) : Promise.resolve([]),
    ctx.fantasy.careerTable(),
    ctx.fantasy.fixtureStatRows(),
    ctx.fantasy.streakInputs(),
  ]);

  await ctx.client.answerInlineQuery(
    buildInlineAnswer(query, {
      seasonName: season?.name ?? "The table",
      seasonRows,
      careerRows,
      fixtureRows,
      streaks,
      miniAppUrl: ctx.miniAppUrl,
    }),
  );
}

/** Shared bail-out: the league commands are all useless without the fantasy reads. */
async function requireFantasy(ctx: BotContext, chatId: number): Promise<FantasyDeps | null> {
  if (ctx.fantasy) return ctx.fantasy;
  await ctx.client.sendMessage({ chat_id: chatId, text: "Not wired up yet." });
  return null;
}

/**
 * Sends a picture when the bot can draw one and the message when it cannot, so a
 * failed render is a plainer answer rather than no answer.
 */
async function sendPicture(
  ctx: BotContext,
  message: {
    chatId: number;
    text: string;
    caption: string;
    receiverUserId?: number;
    replyMarkup?: InlineKeyboardMarkup;
  },
  illustration: Illustration | null,
): Promise<void> {
  if (ctx.pictures && illustration) {
    await sendIllustrated({ client: ctx.client, render: ctx.pictures.render }, message, illustration);
    return;
  }

  if (message.receiverUserId !== undefined) {
    await ctx.client.sendEphemeral(message.chatId, message.receiverUserId, message.text, {
      replyMarkup: message.replyMarkup,
    });
    return;
  }

  await ctx.client.sendMessage({
    chat_id: message.chatId,
    text: message.text,
    parse_mode: "HTML",
    reply_markup: message.replyMarkup,
  });
}

async function sendTable(ctx: BotContext, chatId: number): Promise<void> {
  const fantasy = await requireFantasy(ctx, chatId);
  if (!fantasy) return;

  const season = await fantasy.currentSeason();
  const rows = season ? await fantasy.seasonTable(season.id) : [];
  const table = ratingTable(rows);
  const seasonName = season?.name ?? "The table";

  await sendPicture(
    ctx,
    {
      chatId,
      text: tableMessage(table, seasonName),
      caption: tableCaption(table, seasonName),
      // The one message people want to show somebody who is not in the group.
      replyMarkup: { inline_keyboard: [[shareButton()]] },
    },
    (await ctx.pictures?.leaderboard()) ?? null,
  );
}

async function sendLeaderboards(ctx: BotContext, chatId: number): Promise<void> {
  const fantasy = await requireFantasy(ctx, chatId);
  if (!fantasy) return;

  const season = await fantasy.currentSeason();
  const rows = season ? await fantasy.seasonTable(season.id) : [];

  await ctx.client.sendMessage({
    chat_id: chatId,
    text: leaderboardMessage(allLeaderboards(rows, 3)),
    parse_mode: "HTML",
  });
}

async function sendRecords(ctx: BotContext, chatId: number): Promise<void> {
  const fantasy = await requireFantasy(ctx, chatId);
  if (!fantasy) return;

  const [fixtureRows, careerRows, streaks] = await Promise.all([
    fantasy.fixtureStatRows(),
    fantasy.careerTable(),
    fantasy.streakInputs(),
  ]);

  await ctx.client.sendMessage({
    chat_id: chatId,
    text: recordsMessage(
      hallOfFame(fixtureRows, careerRows),
      longestStreak(streaks.fixtureIdsOldestFirst, streaks.byPlayer),
    ),
    parse_mode: "HTML",
  });
}

/**
 * A card is about one person, so in the group it goes out ephemerally: everybody can
 * ask for their own without turning the chat into a wall of stat blocks.
 */
async function sendPlayerCard(ctx: BotContext, message: TelegramMessage): Promise<void> {
  const fantasy = await requireFantasy(ctx, message.chat.id);
  if (!fantasy || !message.from) return;

  const { player } = await ctx.services.ensurePlayer(message.from);
  const identity = {
    id: player.id,
    displayName: player.display_name,
    emoji: player.emoji,
    rating: Number(player.rating),
  };

  const card = await fantasy.playerCard(identity);

  await sendPicture(
    ctx,
    {
      chatId: message.chat.id,
      text: playerCardMessage(card),
      caption: playerCardCaption(card),
      // In a private chat there is nobody to hide it from, and ephemeral parameters
      // are only meaningful in a group.
      receiverUserId: message.chat.type === "private" ? undefined : message.from.id,
    },
    (await ctx.pictures?.playerCard(identity)) ?? null,
  );
}

async function sendNextFixture(ctx: BotContext, chatId: number): Promise<void> {
  const fixture = await ctx.services.openFixture();

  if (!fixture) {
    await ctx.client.sendMessage({
      chat_id: chatId,
      text: "No game on the books yet. I'll shout when there is one.",
    });
    return;
  }

  const rsvps = await ctx.services.listRsvps(fixture.id);
  await ctx.client.sendMessage({
    chat_id: chatId,
    text: squadMessage(toFixtureLike(fixture), breakdownFrom(rsvps), ctx.now),
    parse_mode: "HTML",
    reply_markup: keyboardFor(fixture, rsvps),
  });
}

/**
 * "/where" reads the venue back; "/where <anything>" moves the game.
 *
 * Anybody can move it. That is the point rather than an oversight: the person who
 * knows the pitch is double-booked is a player with a phone, and making them find an
 * administrator first is how a game ends up at the wrong ground. The last word wins,
 * and the change is announced to the group so a mistake is visible immediately —
 * which is a better safeguard than a permission check nobody can exercise at 17:00.
 */
async function handleWhere(
  ctx: BotContext,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  const fixture = await ctx.services.openFixture();

  if (!fixture) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: "No game on the books to move. I'll shout when there is one.",
    });
    return;
  }

  const argument = text.split(/\s+/).slice(1).join(" ").trim();

  if (!argument) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: venueMessage(venueOfFixture(fixture), new Date(fixture.kickoff_at)),
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[venueButton(venueOfFixture(fixture))]] },
    });
    return;
  }

  const parsed = parseVenue(argument);

  if (!parsed) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: "Tell me where — a name, a pin, or a Google Maps link.",
    });
    return;
  }

  // A phone's share button produces a short link that carries no coordinates at all,
  // so this is the common case rather than the exotic one. It fails soft: a link we
  // cannot follow is still a link somebody can tap.
  const venue = await resolveShortMapsLink(parsed);
  await ctx.services.setVenue(fixture.id, venue);

  // Announced where the game is organised, not where the command was typed. Somebody
  // moving the venue from a private chat would otherwise change it for everyone while
  // being the only person who knows — the silent version of the exact mistake this
  // command exists to let anybody correct.
  await ctx.client.sendMessage({
    chat_id: fixture.rsvp_chat_id ?? message.chat.id,
    text: venueChangedMessage({
      venue,
      kickoffAt: new Date(fixture.kickoff_at),
      movedBy: message.from?.first_name ?? "Somebody",
    }),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[venueButton(venue)]] },
  });
}

async function handleCallbackQuery(
  ctx: BotContext,
  query: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  const action = query.data ? decodeCallback(query.data) : null;

  if (!action) {
    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }

  if (action.kind === "rsvp") {
    await applyRsvp(ctx, query, action.fixtureId, action.status);
    return;
  }

  if (action.kind === "night") {
    await applyNightVote(ctx, query, action.night);
    return;
  }

  if (action.kind === "report" || action.kind === "reportMotm" || action.kind === "reportSkip") {
    if (!ctx.reports) {
      await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
      return;
    }
    const { player } = await ctx.services.ensurePlayer(query.from);
    await handleReportAction({ client: ctx.client, reports: ctx.reports }, query, action, player.id);
    return;
  }

  // Everything else lands in later milestones; acknowledge so the client stops
  // spinning rather than leaving the button in a loading state.
  await ctx.client.answerCallbackQuery({
    callback_query_id: query.id,
    text: "Coming soon.",
  });
}

/**
 * Somebody tapped a night on Monday's poll.
 *
 * The week comes from the clock, not from the button, so a tap on last week's message
 * counts towards this week — which is what the person meant, and the only reading that
 * cannot retroactively change a week already played.
 *
 * The message is rewritten in place with the new counts. Editing rather than replying
 * is the whole reason this is an inline keyboard: a group of 38 tapping five nights
 * would otherwise produce a wall of confirmations, which is precisely the "annoying
 * enough to mute" failure this has to avoid.
 */
async function applyNightVote(
  ctx: BotContext,
  query: NonNullable<TelegramUpdate["callback_query"]>,
  night: string,
): Promise<void> {
  const option = nightByKey(night);

  if (!option || !ctx.nights) {
    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }

  const week = weekStart(ctx.now);
  const { player } = await ctx.services.ensurePlayer(query.from);
  const { voted } = await ctx.nights.toggleNightVote({
    weekStart: week,
    playerId: player.id,
    night: option.key,
  });

  const votes = await ctx.nights.votesForWeek(week);
  const outcome = resolveNights(votes);

  await ctx.client.answerCallbackQuery({
    callback_query_id: query.id,
    text: nightVoteAcknowledgement({ night: option.label, voted, votes }).slice(0, 200),
  });

  if (!query.message) return;

  try {
    await ctx.client.editMessageText({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: nightPollMessage(outcome),
      parse_mode: "HTML",
      reply_markup: nightPollKeyboard(outcome.tally),
    });
  } catch {
    // Telegram rejects an edit that changes nothing, and two people voting for the
    // same night a second apart can produce exactly that. The vote is already stored;
    // failing here would undo nothing and say something alarming in the chat.
  }
}

async function applyRsvp(
  ctx: BotContext,
  query: NonNullable<TelegramUpdate["callback_query"]>,
  fixtureId: string,
  status: "in" | "out" | "maybe",
): Promise<void> {
  const fixture = await ctx.services.fixtureById(fixtureId);

  if (!fixture || fixture.status === "cancelled" || fixture.status === "played") {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: "That game has been and gone.",
      show_alert: true,
    });
    return;
  }

  const { player } = await ctx.services.ensurePlayer(query.from);

  const before = await ctx.services.commitmentsFor(fixtureId);
  await ctx.services.setRsvp(fixtureId, player.id, status);
  const rsvps = await ctx.services.listRsvps(fixtureId);
  const after = toCommitments(rsvps);

  const shape = shapeOf(fixture);
  const mine = rsvps.find((r) => r.player_id === player.id);
  const health = squadHealth(after, shape);

  await ctx.client.answerCallbackQuery({
    callback_query_id: query.id,
    text: plainText(
      rsvpAcknowledgement({
        displayName: player.display_name,
        status,
        position: mine?.squad_position ?? null,
        waitlisted: mine?.is_waitlisted ?? false,
        spotsLeft: health.spotsLeft,
      }),
    ).slice(0, 200),
    show_alert: mine?.is_waitlisted ?? false,
  });

  // Somebody dropping out pulls the next person off the waiting list; tell exactly
  // those people, once.
  const promoted = promotionsBetween(before, after, shape);
  if (promoted.length > 0) {
    await ctx.services.markPromoted(fixtureId, promoted);
  }

  if (fixture.rsvp_chat_id && fixture.rsvp_message_id) {
    await ctx.client.editMessageText({
      chat_id: fixture.rsvp_chat_id,
      message_id: fixture.rsvp_message_id,
      text: squadMessage(toFixtureLike(fixture), breakdownFrom(rsvps), ctx.now),
      parse_mode: "HTML",
      reply_markup: keyboardFor(fixture, rsvps),
    });
  }
}

function promotionsBetween(
  before: ReturnType<typeof toCommitments>,
  after: ReturnType<typeof toCommitments>,
  shape: { playersPerTeam: number; subsPerTeam: number },
): string[] {
  const wasPlaying = new Set(splitSquad(before, shape).playing.map((c) => c.player.id));
  return splitSquad(after, shape)
    .playing.filter((c) => !wasPlaying.has(c.player.id))
    .map((c) => c.player.id);
}

/**
 * The poll keyboard, told what state the game is in.
 *
 * Without this the "I'm in" button looked identical whether there were eight spaces
 * left, none at all, or the teams had already been picked — so tapping it was the only
 * way to find out, and two of those three answers were a disappointment.
 */
export function keyboardFor(fixture: FixtureRow, rsvps: FixtureRsvpView[]) {
  const health = squadHealth(toCommitments(rsvps), shapeOf(fixture));

  return rsvpKeyboard(fixture.id, {
    full: health.full,
    locked: fixture.status === "locked" || fixture.status === "played",
  });
}

export function toFixtureLike(fixture: FixtureRow): FixtureLike {
  return {
    id: fixture.id,
    kickoffAt: new Date(fixture.kickoff_at),
    venue: fixture.venue,
    rsvpClosesAt: fixture.rsvp_closes_at ? new Date(fixture.rsvp_closes_at) : null,
    shape: shapeOf(fixture),
  };
}

export function breakdownFrom(rsvps: FixtureRsvpView[]) {
  const named = (r: FixtureRsvpView) => ({
    displayName: r.display_name ?? "Someone",
    emoji: r.emoji ?? "⚽",
  });
  return {
    commitments: toCommitments(rsvps),
    maybes: rsvps.filter((r) => r.status === "maybe").map(named),
    outs: rsvps.filter((r) => r.status === "out").map(named),
  };
}

/** Callback answers are plain text, so strip the HTML the message helpers add. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function helpText(): string {
  return [
    "⚽ <b>Muizenberg Wednesday League</b>",
    "",
    "You're already a member — being in the group is all it takes.",
    "",
    "<b>/next</b> — who's playing next game",
    "<b>/where</b> — where it is, or move it: <i>/where Sea Point + a maps link</i>",
    "<b>/table</b> — the season table",
    "<b>/leaders</b> — Golden Boot, Nutmeg King and the rest",
    "<b>/me</b> — your player card, just for you",
    "<b>/records</b> — the hall of fame",
    "<b>/help</b> — this",
    "",
    "I'll ask the group who's keen the day before each game, and ask you how it went afterwards.",
  ].join("\n");
}
