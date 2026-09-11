import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

/**
 * The pictures are set in the same typeface as the website.
 *
 * Without this Satori falls back to whatever it ships with, so the one surface most
 * people ever see — a card in a chat — was the only part of the design wearing a
 * default. The files are three static instances rather than the variable Archivo
 * Google publishes, because Satori renders a variable font at a single instance and
 * the weight contrast between a name and its label is most of the card's hierarchy.
 *
 * `new URL(..., import.meta.url)` is the documented way to reach an asset from a
 * route: the bundler rewrites it and traces the file into the deployment, which a
 * path built from `process.cwd()` does not reliably do.
 */
const FONT_FILES = [
  { url: new URL("./fonts/Archivo-Regular.ttf", import.meta.url), weight: 400 },
  { url: new URL("./fonts/Archivo-Bold.ttf", import.meta.url), weight: 700 },
  { url: new URL("./fonts/Archivo-ExtraBold.ttf", import.meta.url), weight: 800 },
] as const;

type LoadedFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700 | 800;
  style: "normal";
};

/** Read once per process, not once per image. */
let cached: Promise<LoadedFont[]> | null = null;

function archivo(): Promise<LoadedFont[]> {
  // Read off disk rather than fetched: Node's fetch refuses a file:// URL outright
  // ("not implemented... yet"), which turns every picture into a 500 with no clue
  // that a font was the cause.
  cached ??= Promise.all(
    FONT_FILES.map(async ({ url, weight }) => ({
      name: "Archivo",
      data: await readFile(fileURLToPath(url)),
      weight,
      style: "normal" as const,
    })),
  );

  return cached;
}

export async function imageResponse(
  element: ReactElement,
  size: ImageSize,
): Promise<ImageResponse> {
  return new ImageResponse(element, {
    width: size.width,
    height: size.height,
    fonts: await archivo(),
  });
}

export async function renderPng(element: ReactElement, size: ImageSize): Promise<Uint8Array> {
  const response = await imageResponse(element, size);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
