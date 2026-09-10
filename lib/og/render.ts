import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import type { ImageSize } from "./layout";

/**
 * Turning an element into PNG bytes.
 *
 * The bot uploads bytes rather than handing Telegram a URL to fetch. That is a
 * deliberate choice: a URL would have to be publicly reachable, which means the
 * images only work once deployed and cannot be seen at all in the local emulator.
 * Rendering in process means the same code path runs on a laptop and on Vercel.
 */

export function imageResponse(element: ReactElement, size: ImageSize): ImageResponse {
  return new ImageResponse(element, { width: size.width, height: size.height });
}

export async function renderPng(element: ReactElement, size: ImageSize): Promise<Uint8Array> {
  const response = imageResponse(element, size);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
