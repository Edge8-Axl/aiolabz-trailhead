-- Inbound webhook sink: Resend delivery events for roster emails.
-- Written to by POST /api/webhooks/resend AFTER Svix signature verification.
--
-- svix_id is the provider's unique event id. UNIQUE makes replays idempotent:
-- a re-delivered (or captured-and-replayed) event collides on insert instead
-- of writing a duplicate delivery record.

create table public.email_event (
  id          uuid primary key default gen_random_uuid(),
  svix_id     text not null unique,
  type        text not null,
  email       text,
  message_id  text,
  created_at  timestamptz not null default now()
);

-- RLS ON from the start (deny-by-default), unlike the earlier tables that had
-- to be backfilled. The webhook writes with the service_role client, which
-- bypasses RLS; no authenticated user needs to read these yet, so we add NO
-- policy — leaving it deny-all until a real reader (e.g. a manager dashboard)
-- exists and earns its own scoped select policy.
alter table public.email_event enable row level security;
