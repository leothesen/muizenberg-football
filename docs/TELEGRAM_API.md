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
