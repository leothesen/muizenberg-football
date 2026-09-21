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
  abandonedMessage,
  calendarButton,
  doubtMessage,
  bringMessage,
  gameCalledMessage,
  gameHelpMessage,
  rsvpAcknowledgement,
  rsvpKeyboard,
  shareButton,
  squadMessage,
  venueButton,
  venueChangedMessage,
  venueMessage,
  type FixtureLike,
} from "./messages";
import { identityChangedMessage, identityMessage } from "./identity";
import { parseDisplayName, parseEmoji } from "@/domain/identity";
import { hasCollapsed } from "@/domain/formats";
import { parseWhen } from "@/domain/when";
import { describeKickoff } from "@/domain/schedule";
import { parseVenue, resolveShortMapsLink, venueOfFixture } from "@/domain/venues";
import { nightByKey, resolveNights, weekStart } from "@/domain/nights";
import {
  nightPollKeyboard,
  nightPollMessage,
  nightVoteAcknowledgement,
  nightVoteRefusal,
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
import { handleReportAction, startQuestionnaire, type ReportDeps } from "./report-handler";
import {
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
  /** The group the league is organised in, for commands sent privately. */
  leagueChatId?: number;
  /** Absent in tests that do not exercise the invite link. */
  invites?: InviteDeps;
  /** Absent in tests that do not exercise somebody calling an ad hoc game. */
  fixtures?: FixtureDeps;
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
  /**
   * This week's poll: the group message it lives in, and whether the booking has run.
   * Null until Monday's poll goes up.
   */
  nightPoll(weekStart: string): Promise<{
    chat_id: number | null;
    message_id: number | null;
    resolved_at: string | null;
  } | null>;
}

/**
 * Putting a fixture on the books from a chat message.
 *
 * Separate from BotServices because it is the only place the bot creates a fixture
 * rather than reading one a cron made, and creating one needs a season — a concern
 * nothing else in the router has.
 */
export interface FixtureDeps {
  bookFixture(kickoffAt: Date): Promise<{ fixture: FixtureRow; created: boolean }>;
  attachRsvpMessage(fixtureId: string, chatId: number, messageId: number): Promise<void>;
}

/** Remembering the group's invite link, so a new one is not minted per request. */
export interface InviteDeps {
  cachedInviteLink(chatId: number): Promise<string | null>;
  rememberInviteLink(chatId: number, link: string): Promise<void>;
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
  const { isNew } = await ctx.services.ensurePlayer(user);

  if (!isNew) {
    await ctx.client.sendEphemeral(chatId, user.id, welcomeBackMessage(user.first_name));
    return;
  }

  // upcomingFixture, not openFixture: somebody joining on match-day afternoon should
  // be told there is a game tonight, even though its teams are already picked.
  // openFixture stops at `open` and would have greeted them with nothing to answer.
  const fixture = await ctx.services.upcomingFixture();
  const nightPollRows = await openNightPollRows(ctx);

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
        nightPollOpen: Boolean(nightPollRows),
      }),
      caption: welcomeCaption(user.first_name, { nightPollOpen: Boolean(nightPollRows) }),
      receiverUserId: user.id,
      replyMarkup: welcomeKeyboard({
        miniAppUrl: ctx.miniAppUrl,
        // Carried here because a newcomer cannot rely on seeing the pinned poll.
        openFixtureId: fixture?.id,
        locked: fixture?.status === "locked",
        nightPollRows,
      }),
    },
    ctx.pictures ? ctx.pictures.welcome() : null,
  );
}

/**
 * This week's night-poll buttons, while the vote is still open — for a welcome.
 *
 * Somebody joining between Monday's poll and Tuesday's booking arrives with no game on
 * the books, so the RSVP row the welcome carries had nothing in it, and the poll that
 * was deciding their week sat somewhere above them in a chat they may not be able to
 * scroll back through. Undefined whenever there is nothing to vote on.
 */
async function openNightPollRows(
  ctx: BotContext,
): Promise<InlineKeyboardMarkup["inline_keyboard"] | undefined> {
  if (!ctx.nights) return undefined;

  const week = weekStart(ctx.now);
  const poll = await ctx.nights.nightPoll(week);
  if (!poll?.message_id || poll.resolved_at) return undefined;

  const votes = await ctx.nights.votesForWeek(week);
  return nightPollKeyboard(resolveNights(votes).tally).inline_keyboard;
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
      await sendPlayerCard(ctx, {
        chatId: message.chat.id,
        user: senderOf(message),
        privately: message.chat.type === "private",
      });
      return;

    case "where":
      await handleWhere(ctx, message, text);
      return;

    case "off":
    case "rain":
      await handleOff(ctx, message, text);
      return;

    case "game":
    case "kickabout":
      await handleGame(ctx, message, text);
      return;

    case "bring":
    case "invite":
      await handleBring(ctx, message);
      return;

    case "name":
    case "emoji":
      await handleIdentity(ctx, message, command, text);
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
async function sendPlayerCard(
  ctx: BotContext,
  where: { chatId: number; user: TelegramUser; privately: boolean },
): Promise<void> {
  const fantasy = await requireFantasy(ctx, where.chatId);
  if (!fantasy) return;

  const { player } = await ctx.services.ensurePlayer(where.user);
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
      chatId: where.chatId,
      text: playerCardMessage(card),
      caption: playerCardCaption(card),
      // In a private chat there is nobody to hide it from, and ephemeral parameters
      // are only meaningful in a group.
      receiverUserId: where.privately ? undefined : where.user.id,
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

/**
 * "It's chucking it down."
 *
 * Not a cancel button. Nobody in this league has the authority to call a game off for
 * everybody else, and handing one person that power would recreate the organiser the
 * whole design removed. What this does is put the question to the group: the sender
 * goes out, everybody sees why, and everybody else decides for themselves.
 *
 * The game then ends the only way it honestly can — because the people who were going
 * to play it left. If enough stay in, it is still on, and the person who raised it has
 * lost nothing but a Wednesday.
 */
async function handleOff(
  ctx: BotContext,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  const fixture = await ctx.services.upcomingFixture();

  if (!fixture) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: "No game on the books to call off.",
    });
    return;
  }

  const reason = text.split(/\s+/).slice(1).join(" ").trim();
  await raiseDoubt(ctx, {
    fixture,
    user: senderOf(message),
    reason,
    fallbackChatId: message.chat.id,
  });
}

/**
 * Somebody is out, and the group is asked whether it is still on.
 *
 * Shared by /off and by the weather button on the pinned poll, because they are the
 * same act — the command is what somebody who has read the help types, and the button
 * is what somebody looking out of a window at five o'clock actually taps.
 */
async function raiseDoubt(
  ctx: BotContext,
  params: {
    fixture: FixtureRow;
    user: TelegramUser;
    reason: string;
    fallbackChatId: number;
  },
): Promise<void> {
  const { player } = await ctx.services.ensurePlayer(params.user);
  await ctx.services.setRsvp(params.fixture.id, player.id, "out");

  const rsvps = await ctx.services.listRsvps(params.fixture.id);
  const health = squadHealth(toCommitments(rsvps), shapeOf(params.fixture));
  const chatId = params.fixture.rsvp_chat_id ?? params.fallbackChatId;

  // Said out loud where the game is organised, so the person who knows the pitch is
  // playable can answer. A DM would let one person quietly empty the squad.
  await ctx.client.sendMessage({
    chat_id: chatId,
    text: doubtMessage({
      raisedBy: params.user.first_name,
      reason: params.reason,
      confirmed: health.confirmed,
      kickoffAt: new Date(params.fixture.kickoff_at),
    }),
    parse_mode: "HTML",
    reply_markup: keyboardFor(params.fixture, rsvps),
  });

  await abandonIfCollapsed(ctx, params.fixture, health.confirmed, chatId, params.reason);
}

/**
 * Anybody can put a game on the books.
 *
 * The group's own description says "Sunday evenings ad hoc", and the app had no
 * concept of a game outside the weekly rhythm at all — the only fixtures that could
 * exist were ones a cron created. This is the purest form of the whole design: no
 * vote, no threshold, no permission. Somebody says there is a game on Saturday, and
 * now there is one, and everybody else answers it the same way they answer any other.
 *
 * The poll goes up immediately rather than waiting for the day-before cron, because a
 * game called on Thursday for Saturday has to start collecting answers on Thursday.
 */
async function handleGame(
  ctx: BotContext,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  const argument = text.split(/\s+/).slice(1).join(" ").trim();
  const parsed = argument ? parseWhen(argument, ctx.now) : null;

  if (!parsed) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: gameHelpMessage(argument),
      parse_mode: "HTML",
    });
    return;
  }

  if (!ctx.fixtures) return;

  const { fixture, created } = await ctx.fixtures.bookFixture(parsed.kickoffAt);
  const chatId = message.chat.type === "private" ? (fixture.rsvp_chat_id ?? message.chat.id) : message.chat.id;

  if (!created) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: `There's already a game then. ${escapeHtml(describeKickoff(parsed.kickoffAt))}.`,
      parse_mode: "HTML",
    });
    return;
  }

  const sent = await ctx.client.sendMessage({
    chat_id: chatId,
    text: gameCalledMessage({
      calledBy: message.from?.first_name ?? "Somebody",
      kickoffAt: parsed.kickoffAt,
      venue: venueOfFixture(fixture),
      assumedTime: parsed.assumedTime,
    }),
    parse_mode: "HTML",
    reply_markup: rsvpKeyboard(fixture.id),
  });

  // Attached so the squad message is edited in place as people answer, exactly like
  // the weekly poll — without this the count would only ever be visible by asking.
  await ctx.fixtures.attachRsvpMessage(fixture.id, chatId, sent.message_id);
}

/**
 * "I want to bring someone."
 *
 * The answer is a link, not a record. An earlier version of this created a guest
 * player so somebody's mate could be counted without installing anything — which
 * counted them correctly and quietly removed the only reason they would ever join.
 * The league is migrating off WhatsApp; a permanent second roster of people the bot
 * cannot talk to is the failure, not the workaround.
 *
 * Ephemeral, so a link nobody else needed does not sit in the group, and so the
 * person who asked can copy it straight into whatever chat their mate is actually in.
 */
async function handleBring(ctx: BotContext, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.type === "private" ? ctx.leagueChatId : message.chat.id;

  if (!chatId || !ctx.invites) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text: "I can't hand out an invite link from here.",
    });
    return;
  }

  let link = await ctx.invites.cachedInviteLink(chatId);

  if (!link) {
    try {
      // Created once and remembered. Telegram mints a new link every time it is
      // asked, and a group whose settings hold forty of them is somebody's afternoon.
      const created = await ctx.client.createChatInviteLink({
        chat_id: chatId,
        name: "Bring a mate",
      });
      link = created.invite_link;
      await ctx.invites.rememberInviteLink(chatId, link);
    } catch {
      // The bot needs admin rights with invite permission. It has them today because
      // it pins the poll, but an admin change elsewhere must not produce a stack
      // trace in a group chat.
      await ctx.client.sendEphemeral(
        message.chat.id,
        message.from?.id ?? 0,
        "I can't make an invite link — I need to be a group admin with permission to invite.",
      );
      return;
    }
  }

  await ctx.client.sendEphemeral(
    message.chat.id,
    message.from?.id ?? 0,
    bringMessage(link),
  );
}

/**
 * "/name Daniel G." and "/emoji 🦖".
 *
 * Both work in the group, because that is where people are when they notice there are
 * two Liams on the sheet, and the answer is ephemeral so nobody else has to read it.
 * Sent bare, either one shows what you are currently called and how to change it —
 * the commonest thing somebody types first is the command with nothing after it.
 *
 * Nothing here is anybody else's to do. A player owns their own name and their own
 * emoji, which is the same rule as everything else in this bot: there is no admin to
 * ask and nobody to approve it.
 */
async function handleIdentity(
  ctx: BotContext,
  message: TelegramMessage,
  command: string,
  text: string,
): Promise<void> {
  const { player } = await ctx.services.ensurePlayer(senderOf(message));
  const current = { displayName: player.display_name, emoji: player.emoji };
  const argument = text.split(/\s+/).slice(1).join(" ");

  if (!argument.trim()) {
    await replyToSender(ctx, message, identityMessage(current));
    return;
  }

  if (command === "emoji") {
    const parsed = parseEmoji(argument);
    if (!parsed.ok) {
      await replyToSender(ctx, message, parsed.reason);
      return;
    }

    await ctx.services.setEmoji(player.id, parsed.value);
    await replyToSender(
      ctx,
      message,
      identityChangedMessage({ ...current, emoji: parsed.value }),
    );
    return;
  }

  const parsed = parseDisplayName(argument);
  if (!parsed.ok) {
    await replyToSender(ctx, message, parsed.reason);
    return;
  }

  await ctx.services.setDisplayName(player.id, parsed.value);
  await replyToSender(
    ctx,
    message,
    identityChangedMessage({ ...current, displayName: parsed.value }),
  );
}

/**
 * An answer meant for one person, wherever they asked.
 *
 * Ephemeral in a group and an ordinary message in a private chat: ephemeral
 * parameters only mean anything where there is somebody to hide the message from.
 */
async function replyToSender(
  ctx: BotContext,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  if (message.chat.type === "private" || !message.from) {
    await ctx.client.sendMessage({
      chat_id: message.chat.id,
      text,
      parse_mode: "HTML",
    });
    return;
  }

  await ctx.client.sendEphemeral(message.chat.id, message.from.id, text);
}

/**
 * The same, for somebody who pressed a button rather than typed.
 *
 * A message instead of a callback answer, because a toast is 200 plain characters and
 * cannot hold a button. The callback id rides along on the send, which is what stops
 * the button spinning — answering twice would be an error from Telegram.
 *
 * Falls back to the toast when the tap did not come from a message we can reply
 * beside, which is the inline-mode case: sending into a private chat the bot may
 * never have had would fail outright, and losing a button beats losing the answer.
 */
async function sendPrivately(
  ctx: BotContext,
  query: NonNullable<TelegramUpdate["callback_query"]>,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  const chat = query.message?.chat;

  if (!chat) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: plainText(text).slice(0, 200),
    });
    return;
  }

  if (chat.type === "private") {
    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
    await ctx.client.sendMessage({
      chat_id: chat.id,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    return;
  }

  await ctx.client.sendEphemeral(chat.id, query.from.id, text, {
    replyMarkup,
    callbackQueryId: query.id,
  });
}

/** The message.from of a command, or a stand-in that ensurePlayer can still key on. */
function senderOf(message: TelegramMessage): TelegramUser {
  return message.from ?? { id: 0, is_bot: false, first_name: "Somebody" };
}

/**
 * End an evening that has stopped being a game.
 *
 * Only ever reached when teams were already picked and then the people on them left,
 * which in practice means weather. A thin turnout never lands here — that is what the
 * formats ladder is for, and telling five people the game is off is the one outcome
 * that makes next week worse.
 */
async function abandonIfCollapsed(
  ctx: BotContext,
  fixture: FixtureRow,
  confirmed: number,
  chatId: number,
  reason: string,
): Promise<void> {
  if (!hasCollapsed({ status: fixture.status, confirmed })) return;

  await ctx.services.setFixtureStatus(fixture.id, "cancelled", reason || "Everybody dropped out");

  await ctx.client.sendMessage({
    chat_id: chatId,
    text: abandonedMessage({
      kickoffAt: new Date(fixture.kickoff_at),
      reason,
    }),
    parse_mode: "HTML",
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

  if (action.kind === "doubt") {
    const fixture = await ctx.services.fixtureById(action.fixtureId);

    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: fixture
        ? "You're out. Asked the group whether it's still on."
        : "That game has been and gone.",
    });

    if (fixture) {
      await raiseDoubt(ctx, {
        fixture,
        user: query.from,
        reason: "weather looks bad",
        fallbackChatId: query.message?.chat.id ?? 0,
      });
    }
    return;
  }

  // The buttons that ride along under the poll and the welcome. Two of these have
  // answered "Coming soon." since they were drawn — on a message the group reads every
  // week, which is worse than not being there at all — and the third is new. They do
  // exactly what the commands of the same name do, because that is what somebody
  // pressing a button called "My card" is entitled to assume.
  if (action.kind === "identity" || action.kind === "myCard" || action.kind === "table") {
    const chat = query.message?.chat;

    // No message means inline mode, where none of these buttons is ever drawn. Sending
    // into a private chat the bot may never have had would fail outright.
    if (!chat) {
      await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
      return;
    }

    if (action.kind === "identity") {
      const { player } = await ctx.services.ensurePlayer(query.from);
      await sendPrivately(
        ctx,
        query,
        identityMessage({ displayName: player.display_name, emoji: player.emoji }),
      );
      return;
    }

    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });

    if (action.kind === "myCard") {
      await sendPlayerCard(ctx, {
        chatId: chat.id,
        user: query.from,
        privately: chat.type === "private",
      });
      return;
    }

    // The table is the one answer that belongs to everybody: /table posts it to the
    // group, and a button beside it that whispered would be a different feature.
    await sendTable(ctx, chat.id);
    return;
  }

  if (
    action.kind === "report" ||
    action.kind === "reportMotm" ||
    action.kind === "reportSkip" ||
    action.kind === "reportStart"
  ) {
    if (!ctx.reports) {
      await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
      return;
    }
    const { player } = await ctx.services.ensurePlayer(query.from);
    const reportCtx = {
      client: ctx.client,
      reports: ctx.reports,
      leagueChatId: ctx.leagueChatId,
    };

    if (action.kind === "reportStart") {
      // The button stays under the post for ever, and settlement only reads reports
      // once. Answers given after it has run would be stored and never counted — the
      // same silent loss this flow exists to end — so say so instead.
      const fixture = await ctx.services.fixtureById(action.fixtureId);
      if (fixture?.status !== "locked") {
        await ctx.client.answerCallbackQuery({
          callback_query_id: query.id,
          text: "That game's been settled, so it's too late to log it. The report's in the group.",
          show_alert: true,
        });
        return;
      }

      await startQuestionnaire(reportCtx, query, action.fixtureId, player.id);
    } else {
      await handleReportAction(reportCtx, query, action, player.id);
    }
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
  const poll = await ctx.nights.nightPoll(week);

  // Only this week's poll, and only until it is booked. Telegram leaves old buttons
  // tappable, so without this a tap after Tuesday's booking was stored and moved the
  // count on a week that was already decided — and a tap on last week's poll landed
  // in whatever week it happened to be.
  if (!poll || poll.resolved_at) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: nightVoteRefusal(),
    });
    return;
  }

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

  // The stored poll message, not the one that was tapped. A newcomer's welcome carries
  // these same buttons, and editing the tapped message would rewrite their welcome into
  // a copy of the poll while the real poll's count stayed where it was.
  if (poll.chat_id === null || poll.message_id === null) return;

  try {
    await ctx.client.editMessageText({
      chat_id: poll.chat_id,
      message_id: poll.message_id,
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

  const acknowledgement = rsvpAcknowledgement({
    displayName: player.display_name,
    status,
    position: mine?.squad_position ?? null,
    waitlisted: mine?.is_waitlisted ?? false,
    spotsLeft: health.spotsLeft,
  });

  // Somebody who is actually on the sheet gets a message rather than a toast, because
  // it is the only answer that carries something to press: the calendar link used to
  // sit on the poll, three-up, truncated to "📅 Ad…". Here it arrives at the moment
  // the decision was made, and only to the person who made it.
  //
  // Everyone else keeps the toast. A waiting-list place still uses the modal, which
  // is the one answer people have to read before they plan their evening around it.
  if (status === "in" && !mine?.is_waitlisted && query.message) {
    await sendPrivately(ctx, query, acknowledgement, {
      inline_keyboard: [[calendarButton(fixtureId)]],
    });
  } else {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: plainText(acknowledgement).slice(0, 200),
      show_alert: mine?.is_waitlisted ?? false,
    });
  }

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

  // The same check /off runs, because the group draining away one tap at a time is
  // the commoner shape of the same event: nobody announced anything, it just rained.
  if (fixture.rsvp_chat_id) {
    await abandonIfCollapsed(ctx, fixture, health.confirmed, fixture.rsvp_chat_id, "");
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
    // Match day only. A weather button on a Tuesday poll is a suggestion that the
    // game might not happen, three days before anybody can possibly know.
    weather: fixture.status === "locked",
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
    "⚽ <b>The league</b>",
    "",
    "You're already a member — being in the group is all it takes.",
    "",
    "<b>/next</b> — who's playing next game",
    "<b>/where</b> — where it is, or move it: <i>/where Sea Point + a maps link</i>",
    "<b>/game</b> — put one on any day: <i>/game sat 4pm</i>",
    "<b>/bring</b> — a link to invite a mate into the group",
    "<b>/off</b> — raining? say so, and everyone decides for themselves",
    "<b>/table</b> — the season table",
    "<b>/leaders</b> — Golden Boot, Nutmeg King and the rest",
    "<b>/me</b> — your player card, just for you",
    "<b>/name</b> — be called what you want: <i>/name Daniel G.</i>",
    "<b>/emoji</b> — the picture beside your name: <i>/emoji 🦖</i>",
    "<b>/records</b> — the hall of fame",
    "<b>/help</b> — this",
    "",
    "I'll ask the group who's keen the day before each game, and ask you how it went afterwards.",
  ].join("\n");
}
