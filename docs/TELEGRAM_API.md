# Telegram Bot API — verified notes

Signatures below were read off `https://core.telegram.org/bots/api` on 9 Sep 2026,
not recalled. Anything not listed here should be checked against the reference before
it is used.

## The one that changes the design: ephemeral messages

A bot can post a message **into a group that only one person can see**. This is the
mechanism behind "you get a message in the group that only you can see", and it means
most private interactions never need a DM at all.

`sendMessage` and `sendPhoto` both take `ephemeral_message_parameters`:

| Field | Type | Notes |
| --- | --- | --- |
| `receiver_user_id` | Integer | **Required.** Who sees it. Delivery is not guaranteed if they are offline. |
| `callback_query_id` | String | Optional. The callback query that triggered it. |
| `replace_callback_query_message` | Boolean | Optional. Show in place of the original message. Must be `False` for callback queries that came from an ephemeral message. |

Editing and removing them uses a separate family of methods, addressed by
`(chat_id, receiver_user_id, ephemeral_message_id)` rather than a plain message id:

- `editEphemeralMessageText`
- `editEphemeralMessageMedia`
- `editEphemeralMessageCaption`
- `editEphemeralMessageReplyMarkup`
- `deleteEphemeralMessage`

Because `sendPhoto` supports it too, a rendered player card can be dropped into the
group visible only to its owner.

## Methods this project uses

```
sendMessage       chat_id!, text!, parse_mode, reply_markup, reply_parameters,
                  ephemeral_message_parameters, message_effect_id,
                  disable_notification, protect_content, link_preview_options
sendPhoto         chat_id!, photo! (InputFile or String), caption, parse_mode,
                  reply_markup, ephemeral_message_parameters, has_spoiler
editMessageText   chat_id, message_id, inline_message_id, text, parse_mode,
                  reply_markup, rich_message
editMessageReplyMarkup
                  chat_id, message_id, inline_message_id, reply_markup
deleteMessage     chat_id!, message_id!
answerCallbackQuery
                  callback_query_id!, text (0-200), show_alert, url, cache_time
answerInlineQuery inline_query_id!, results!, cache_time, is_personal, next_offset, button
setMyCommands     commands!, scope, language_code
setChatMenuButton chat_id, menu_button
setWebhook        url!, secret_token, allowed_updates, drop_pending_updates,
                  max_connections, ip_address, certificate
setMessageReaction chat_id!, message_id!, reaction, is_big
pinChatMessage    chat_id!, message_id!, disable_notification
```

`answerCallbackQuery` with `show_alert: true` raises a modal only the tapper sees —
the lightweight cousin of an ephemeral message, capped at 200 characters.

## InlineKeyboardButton

Richer than it used to be. Every field:

```
text, icon_custom_emoji_id, style, url, callback_data, web_app (WebAppInfo),
login_url (LoginUrl), switch_inline_query, switch_inline_query_current_chat,
switch_inline_query_chosen_chat, copy_text (CopyTextButton), callback_game,
pay, disabled (DisabledButton)
```

`disabled` is useful for showing a full squad without the button looking broken;
`copy_text` for handing out a venue address; `style` and `icon_custom_emoji_id` for
polish.

## Learning that somebody joined the group

`Update` carries both `my_chat_member` and `chat_member`, each a `ChatMemberUpdated`:

```
chat, from, date, old_chat_member, new_chat_member, invite_link,
via_join_request, via_chat_folder_invite_link
```

`chat_member` must be named explicitly in `setWebhook(allowed_updates)` — it is not
sent by default. `message.new_chat_members` (Array of User) is the older signal and
still arrives as a service message.

## Privacy mode matters in groups

By default a bot in a group sees only: commands aimed at it (`/cmd@thisbot`), replies
to its own messages, service messages, and messages sent via it. Either disable
privacy mode with BotFather or make the bot an admin if it needs to see general chat.
The league bot does not need general chat, so privacy mode stays **on**.

## Deep links

- `https://t.me/<bot>?start=<payload>` opens a private chat and delivers
  `/start <payload>`.
- `https://t.me/<bot>?startgroup=<payload>` adds the bot to a group.
- Payload is `A-Za-z0-9_-`, up to 64 characters.

## Not available to us

- `sendChecklist` requires a `business_connection_id`, so it is for business accounts
  only and cannot be used in an ordinary group. Checklists are therefore not an
  option for the squad sheet; an edited message with an inline keyboard is.
- The attachment menu is restricted to approved bots.

## Test environment

`https://api.telegram.org/bot<token>/test/METHOD_NAME` runs against Telegram's test
servers, where Mini Apps and Login do not require HTTPS. Useful for local work.

## Inline mode and message effects — read 10 Sep 2026

`answerInlineQuery` takes `inline_query_id`, `results` (max 50), `cache_time`
(default 300), `is_personal`, `next_offset` and `button`
(`InlineQueryResultsButton`: `text` plus exactly one of `web_app` or
`start_parameter`).

`InlineQuery` itself carries `id`, `from`, `query` (up to 256 chars), `offset` and an
optional `chat_type` — "sender", "private", "group", "supergroup" or "channel".

**`InlineQueryResultPhoto.photo_url` must be a URL Telegram itself can fetch.** That
rules photo results out anywhere the site is not publicly reachable, which includes
every laptop and every preview deployment — so they would only ever work in
production, which is the worst place to find out otherwise. The league uses
`InlineQueryResultArticle` instead: it carries the message inline via
`input_message_content` and works everywhere.

`InlineQueryResultArticle`: `type`, `id` (1-64 bytes), `title`,
`input_message_content`, and optionally `reply_markup`, `url`, `description`,
`thumbnail_url`, `thumbnail_width`, `thumbnail_height`.

`InputTextMessageContent`: `message_text` (1-4096), `parse_mode`, `entities`,
`link_preview_options`.

### Message effects are private chats only

`message_effect_id` is documented as **"for private chats only"** on `sendMessage`,
`forwardMessage` and `copyMessage` alike. The group's match report therefore cannot
have confetti, however much it deserves it. The questionnaire lives in a DM, so that
is where the league uses one.

**The effect ids appear nowhere in the reference.** They are client-side constants
that circulate by observation, so an id could be renumbered or retired with no
deprecation — and an unknown one fails the whole `sendMessage`, not just the
decoration. Every effect send therefore goes through `sendWithEffect`, which retries
without it.

### Buttons used here

- `DisabledButton` holds **no fields** — it is `disabled: {}`. Used on the RSVP poll
  once teams are picked, so the button greys out rather than vanishing.
- `CopyTextButton.text` is capped at **256 characters**. `venue` is an unbounded text
  column, so it is clamped before being put in a button; over the limit Telegram
  rejects the entire message rather than trimming.
- `SwitchInlineQueryChosenChat`: `query`, `allow_user_chats`, `allow_bot_chats`,
  `allow_group_chats`, `allow_channel_chats`. Used to share the table into a chat the
  bot has never been added to.
