-- Local development outbox.
--
-- With no bot token configured, every outbound Bot API call is written here instead
-- of being sent. The dev emulator page renders these rows as a fake Telegram chat, so
-- the entire bot — including ephemeral messages, which are otherwise impossible to
-- see without a real group — can be driven end to end on a laptop.
--
-- Never written to in production: the transport is only selected when there is no
-- TELEGRAM_BOT_TOKEN.

create table public.telegram_emulator_messages (
  id bigint generated always as identity primary key,
  method text not null,
  params jsonb not null default '{}'::jsonb,

  -- Lifted out of params so the emulator can filter without digging through jsonb.
  chat_id bigint,
  -- Set only for ephemeral messages: who is allowed to see this.
  receiver_user_id bigint,
  -- The message this call edited or deleted, where it targets an existing one.
  target_message_id bigint,

  created_at timestamptz not null default now()
);

create index telegram_emulator_messages_chat_idx
  on public.telegram_emulator_messages (chat_id, id desc);

alter table public.telegram_emulator_messages enable row level security;
revoke all on public.telegram_emulator_messages from anon, authenticated;
