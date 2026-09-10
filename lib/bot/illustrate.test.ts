import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import { captionFor, CAPTION_LIMIT, sendIllustrated, stripHtml } from "./illustrate";

const ILLUSTRATION = {
  element: createElement("div", null, "x"),
  size: { width: 100, height: 100 },
};

function harness(render: () => Promise<Uint8Array>) {
  const transport = new RecordingTransport();
  const errors: unknown[] = [];
  return {
    transport,
    errors,
    deps: {
      client: new TelegramClient(transport),
      render,
      onRenderError: (e: unknown) => errors.push(e),
    },
  };
}

const okRender = async () => new Uint8Array([1, 2, 3]);
const failingRender = async () => {
  throw new Error("satori exploded");
};

describe("sendIllustrated", () => {
  it("sends a photo with the caption when the render works", async () => {
    const h = harness(okRender);

    const result = await sendIllustrated(
      h.deps,
      { chatId: -100, text: "<b>long message</b>", caption: "<b>short</b>" },
      ILLUSTRATION,
    );

    expect(result.illustrated).toBe(true);
    const call = h.transport.calls[0];
    expect(call?.method).toBe("sendPhoto");
    expect((call?.params as { caption?: string }).caption).toBe("<b>short</b>");
    expect((call?.params as { photo?: unknown }).photo).toBeInstanceOf(Uint8Array);
  });

  it("falls back to the full text message when the render fails", async () => {
    const h = harness(failingRender);

    const result = await sendIllustrated(
      h.deps,
      { chatId: -100, text: "<b>the whole story</b>", caption: "short" },
      ILLUSTRATION,
    );

    expect(result.illustrated).toBe(false);
    expect(h.transport.calls[0]?.method).toBe("sendMessage");
    expect((h.transport.calls[0]?.params as { text?: string }).text).toBe(
      "<b>the whole story</b>",
    );
    expect(h.errors).toHaveLength(1);
  });

  it("keeps a picture private when it belongs to one person", async () => {
    const h = harness(okRender);

    await sendIllustrated(
      h.deps,
      { chatId: -100, text: "yours", caption: "yours", receiverUserId: 999 },
      ILLUSTRATION,
    );

    const params = h.transport.calls[0]?.params as {
      ephemeral_message_parameters?: { receiver_user_id?: number };
    };
    expect(params.ephemeral_message_parameters?.receiver_user_id).toBe(999);
  });

  it("keeps it private on the fallback path too", async () => {
    const h = harness(failingRender);

    await sendIllustrated(
      h.deps,
      { chatId: -100, text: "yours", caption: "yours", receiverUserId: 999 },
      ILLUSTRATION,
    );

    const params = h.transport.calls[0]?.params as {
      ephemeral_message_parameters?: { receiver_user_id?: number };
    };
    expect(h.transport.calls[0]?.method).toBe("sendMessage");
    expect(params.ephemeral_message_parameters?.receiver_user_id).toBe(999);
  });

  it("does not swallow a Telegram failure — only a render failure", async () => {
    const transport = new RecordingTransport();
    const failing = vi
      .spyOn(transport, "call")
      .mockRejectedValue(new Error("telegram is down"));

    await expect(
      sendIllustrated(
        { client: new TelegramClient(transport), render: okRender },
        { chatId: -100, text: "t", caption: "c" },
        ILLUSTRATION,
      ),
    ).rejects.toThrow("telegram is down");

    failing.mockRestore();
  });
});

describe("captionFor", () => {
  it("uses a short caption as HTML", () => {
    expect(captionFor("<b>long</b>", "<b>short</b>")).toEqual({
      text: "<b>short</b>",
      html: true,
    });
  });

  it("strips HTML rather than truncating it, so no tag is left open", () => {
    const long = `<b>${"a".repeat(CAPTION_LIMIT + 100)}</b>`;
    const caption = captionFor(long);

    expect(caption.html).toBe(false);
    expect(caption.text).not.toContain("<");
    expect(caption.text.length).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("falls back to plain text when the given caption is itself too long", () => {
    const caption = captionFor("short", "<i>".concat("b".repeat(CAPTION_LIMIT), "</i>"));
    expect(caption.html).toBe(false);
    expect(caption.text).not.toContain("<i>");
  });

  it("leaves a message that already fits alone, minus its tags", () => {
    const caption = captionFor("<b>Bibs</b> 9-8 <b>Skins</b>");
    expect(caption.text).toBe("Bibs 9-8 Skins");
  });
});

describe("stripHtml", () => {
  it("removes tags and puts entities back", () => {
    expect(stripHtml("<b>Ann &amp; Bob</b>")).toBe("Ann & Bob");
    expect(stripHtml("&lt;script&gt;")).toBe("<script>");
  });
});
