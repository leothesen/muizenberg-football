import { db } from "@/lib/supabase";
import type { TelegramTransport } from "./client";

/**
 * Writes outbound Bot API calls to the database instead of sending them.
 *
 * This is what makes the bot demonstrable without a token, a group chat, or a public
 * URL. It is deliberately faithful about the awkward parts: ephemeral messages record
 * who may see them, and edits record which message they targeted, so the emulator page
 * can reproduce Telegram's actual behaviour rather than a flattened version of it.
 */
export class EmulatorTransport implements TelegramTransport {
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const ephemeral = params.ephemeral_message_parameters as
      | { receiver_user_id?: number }
      | undefined;

    const { data, error } = await db()
      .from("telegram_emulator_messages")
      .insert({
        method,
        params: JSON.parse(JSON.stringify(params, replacer)),
        chat_id: numeric(params.chat_id),
        receiver_user_id:
          numeric(ephemeral?.receiver_user_id) ?? numeric(params.receiver_user_id),
        target_message_id:
          numeric(params.message_id) ?? numeric(params.ephemeral_message_id),
      })
      .select("id")
      .single();

    if (error) throw error;

    // Enough of a Message for callers that store a message_id and edit it later.
    return {
      message_id: data.id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: numeric(params.chat_id) ?? 0, type: "supergroup" },
    } as T;
  }
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Image bytes become a data URL so the emulator can show the actual picture.
 *
 * A byte count was the first version and it was not good enough: the whole point of
 * the emulator is to see what the group would see, and "142108 bytes" does not tell
 * you the footer got clipped. This only ever runs with no bot token, so the size cost
 * lands on a local Postgres and nowhere else — but it is still capped, because a
 * runaway render should not be the thing that fills a laptop's disk.
 */
export const MAX_EMULATOR_IMAGE_BYTES = 2_000_000;

function replacer(_key: string, value: unknown): unknown {
  if (!(value instanceof Uint8Array)) return value;

  if (value.byteLength > MAX_EMULATOR_IMAGE_BYTES) {
    return `<${value.byteLength} bytes, too big to preview>`;
  }

  return `data:image/png;base64,${Buffer.from(value).toString("base64")}`;
}
