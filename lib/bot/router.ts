import { splitSquad, squadHealth } from "@/domain/squad";
import type { TelegramClient } from "@/lib/telegram/client";
import { decodeCallback } from "@/lib/telegram/callbacks";
import {
  PRESENT_STATUSES,
  type TelegramChatMemberUpdated,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/telegram/types";
import { rsvpAcknowledgement, rsvpKeyboard, squadMessage, type FixtureLike } from "./messages";
import { handleReportAction, type ReportDeps } from "./report-handler";
import { startDeepLink, welcomeBackMessage, welcomeKeyboard, welcomeMessage } from "./onboarding";
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

  await ctx.client.sendEphemeral(
    chatId,
    user.id,
    welcomeMessage({
      firstName: user.first_name,
      nextKickoffAt: fixture ? new Date(fixture.kickoff_at) : null,
      now: ctx.now,
      needsPrivateChat,
    }),
    {
      replyMarkup: welcomeKeyboard({
        miniAppUrl: ctx.miniAppUrl,
        startDeepLink: ctx.botUsername ? startDeepLink(ctx.botUsername) : undefined,
        needsPrivateChat,
      }),
    },
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

    default:
      return;
  }
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
    reply_markup: rsvpKeyboard(fixture.id),
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
      reply_markup: rsvpKeyboard(fixtureId),
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
    "<b>/help</b> — this",
    "",
    "I'll ask the group who's keen the day before each game, and ask you how it went afterwards.",
  ].join("\n");
}
