import { TelegramApiError } from "./client";

/**
 * Sending the same thing to a lot of people without getting throttled.
 *
 * Two crons do this: the match-morning nudge and the evening questionnaire, each
 * messaging every player in a tight loop. Telegram's documented ceiling is around 30
 * messages a second overall, and it enforces it by returning 429 with a `retry_after`
 * that can be tens of seconds — long enough to blow a serverless function's budget
 * and leave half the squad unasked.
 *
 * So the sends are paced rather than fired all at once. The transport already honours
 * an explicit `retry_after`; this is the belt to that pair of braces, and it also
 * turns the loop's failures into something the caller can report instead of a throw
 * halfway through that abandons everyone still in the queue.
 */

/** Comfortably inside 30/second, and invisible against a dozen recipients. */
export const DEFAULT_GAP_MS = 60;

export interface FanOutResult<T> {
  delivered: T[];
  /** Somebody who has blocked the bot or never opened a chat with it. */
  unreachable: number;
  failed: number;
  /** True when a 429 forced the run to give up early. */
  throttled: boolean;
}

export interface FanOutOptions {
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onError?: (error: unknown, index: number) => void;
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fanOut<Item, Sent>(
  items: Item[],
  send: (item: Item, index: number) => Promise<Sent | null>,
  options: FanOutOptions = {},
): Promise<FanOutResult<Sent>> {
  const gap = options.gapMs ?? DEFAULT_GAP_MS;
  const sleep = options.sleep ?? DEFAULT_SLEEP;

  const delivered: Sent[] = [];
  let unreachable = 0;
  let failed = 0;
  let throttled = false;

  for (const [index, item] of items.entries()) {
    if (index > 0 && gap > 0) await sleep(gap);

    try {
      const sent = await send(item, index);
      // Null means the caller decided there was nobody to send to.
      if (sent === null) unreachable += 1;
      else delivered.push(sent);
    } catch (error) {
      options.onError?.(error, index);

      if (error instanceof TelegramApiError) {
        if (error.isBlockedByUser) {
          unreachable += 1;
          continue;
        }

        // Still rate limited after the transport's own retries. Pressing on would
        // only deepen the hole, and the cron will come round again.
        if (error.isRateLimited) {
          throttled = true;
          failed += items.length - index;
          break;
        }
      }

      failed += 1;
    }
  }

  return { delivered, unreachable, failed, throttled };
}
