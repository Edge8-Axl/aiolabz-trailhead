# Comms Integration Brief — Trailhead

- **Owner:** Axl Joven (axl.joven@doxatalent.com)
- **Supervisor:** N/A — personal AIOLabz course project (Mission 4/5: outbound notification channels)
- **Date:** 2026-08-25
- **AI assistance:** Drafted with AI assistance (Claude Code); reviewed by Axl Joven. DOXA IN ACTION.
- **Next action:** Commit the mission's files; then verify a real Resend sending domain and provision a real Slack webhook URL before either "reasoned" channel ships.

---

## Goal

Give Trailhead (Next.js 16 + hosted Supabase + Vercel) the communication channels that notify people when real events happen — swaps and shift changes — and prove each one by watching the provider actually respond, not by assuming it works. Every channel is captured as a Channel Card below: built-and-executed cards carry real evidence; reasoned-not-executed cards name the concrete blocker.

## How channels were classified

The test that decided transactional vs. mass outreach: **does the event name the recipient, or does a list?** If one event targets one specific person (or a known small group), it's transactional. If the audience is "everyone who opted in" and the event doesn't name them, it's mass outreach — and only then do consent and unsubscribe belong.

Constraint carried through every card: `phone` and `pay_band` on `staff` are sensitive PII behind RLS. The email channel deliberately uses email addresses (from `auth.users`), never phone. SMS was left for later on this basis.

---

## Channel Card 1 — Transactional Email (Resend)

- **Event:** swap approved / swap denied (one channel, branched copy) + shift assigned/changed (same wrapper logic)
- **Recipient:** the requesting staffer (approved/denied) or the assigned staffer (shift changes)
- **Decision:** **built and executed**
- **Evidence:** HTTP `200`, message id `1e4fef86…` (first 8), recipient domain `edge8.ai` (local part stripped), delivery confirmed in inbox — not just an API 200.
- **Failure behaviour:** on non-2xx (e.g. 429), the send logs the status + provider error text and returns `{ ok: false, status, error }` to the caller. No silent drop. **No retry, no queue yet** — the barista gets nothing unless the caller acts on the returned failure. Retry-with-backoff or a durable queue is a named follow-up; the no-double-send guard becomes load-bearing once retry exists, so a retry can't double-email an approval.
- **Code:** `src/lib/email/resend.ts` — shared `sendTransactional` core + `sendSwapDecision` / `sendShiftAssigned` wrappers.
- **Notes:** status branch keys off the real DB value `'rejected'`, not `'denied'`. Recipient email lives in `auth.users`, not `staff`, so the notifier uses the `service_role` admin client for a cross-user read (documented, notifier-only, never in a request route).

## Channel Card 2 — Mass Outreach (Brevo)

- **Event:** none in v1 (future: unfilled shift → opt-in extra-hours alert)
- **Recipient:** N/A in v1 (future: staff who opted into `notify_extra_shifts`)
- **Decision:** **reasoned, not executed**
- **Evidence / reason for drop:** no opted-in audience exists; every current event targets one person or a known small group, so there is nothing to broadcast and nothing to unsubscribe from. Blocked on a real opt-in mechanism (a `notify_extra_shifts` flag or subscriptions table + consent capture); no Brevo account provisioned by design.
- **Failure behaviour:** N/A — not built.

## Channel Card 3 — Inbound Webhook (Resend delivery events)

- **Event:** Resend delivery events (delivered, bounced, etc.) for swap-approval emails
- **Recipient:** N/A — system-to-system; writes to `email_event`
- **Decision:** **built and executed**
- **Evidence:** forged (no signature) → `401`; tampered (one body byte changed) → `401`; correctly signed → `200` with the row confirmed via read-back; replay of the same signed event → `200` (ack path) with row count unchanged at 1 (`content-range: 0-0/1`).
- **Failure behaviour:** unsigned or tampered requests are refused before any write (`401`, no insert). A replayed valid event is a no-op: the `svix_id` unique constraint rejects the duplicate (`23505`), the handler acks `200`, so the provider stops retrying and `email_event` never holds two records for one event — processed exactly once.
- **Code:** `src/app/api/webhooks/resend/route.ts` (Svix HMAC verify over the raw body, before parse) + `supabase/migrations/20260825120000_email_event.sql`.
- **Notes:** the load-bearing line is `timingSafeEqual` inside `verifySvix`. Tested against a self-generated `whsec_` secret; wiring the real Resend signing secret is a config step, not a code change.

## Channel Card 4 — Outbound to Chat (swap requested → Slack)

- **Event:** swap requested → managers at that location
- **Recipient:** managers' chat channel
- **Decision:** **reasoned, not executed**
- **Evidence / reason:** no Slack workspace or webhook URL exists yet, real or stand-in (Discord / webhook.site not stood up). This is outbound-to-a-webhook, not an inbound webhook — the secret is the URL itself.
- **Failure behaviour:** N/A — not built.

## Channel Card 5 — Secrets Audit

- **Event:** post-integration scan of the repo after the channels above
- **Recipient:** N/A — internal check
- **Decision:** **PASS, zero findings**
- **Evidence:** `git ls-files` + `git grep -n -I` across tracked content, **plus a direct scan of the uncommitted mission files** (`resend.ts`, webhook `route.ts`) — because `git grep` sees tracked content only. Four `process.env.*` references verified correct; no literal values; no tracked `.env*` beyond `.env.example` (placeholders only); no `NEXT_PUBLIC_`-prefixed secret; nothing in git history via `-S` scan. One false positive (an npm `integrity` sha512 hash) reported and dismissed.
- **Failure behaviour:** N/A — nothing to rotate; no live credential was ever tracked.

---

## Decisions (so they're not relitigated)

- **Build where you can run the loop.** Email was built first (real Resend account) and Slack held as reasoned, because a channel you can't execute is guessing at provider behaviour.
- **`service_role` for the notifier only.** The email recipient lives in `auth.users`, which RLS correctly hides from a manager, so the notifier needs an admin read. Isolated to `createSupabaseAdminClient()`, documented, never wired into a request-handling route.
- **Verify caller auth before any write.** The inbound webhook recomputes the Svix signature over the exact raw bytes and `401`s before parsing — the same `service_role` write power makes an unauthenticated POST an admin write by a stranger.
- **Idempotency by unique `svix_id`**, so provider retries never double-write.

## Open items / prerequisites

1. **Resend domain verification** — the email channel only reaches non-account addresses once a sending domain is verified; today it sends from the shared `onboarding@resend.dev` sender.
2. **Real Slack webhook URL** (or a Discord / webhook.site stand-in) before Card 4 moves from reasoned to executed.
3. **Retry / durable queue** for the email channel's 429/5xx path (Card 1) — currently reports failure, does not recover.
4. **Real Resend webhook signing secret** wired into `RESEND_WEBHOOK_SECRET` (Card 3 was proven against a test secret).
5. **Migration drift (pre-existing, from the backend handoff):** RLS on `location` / `shift` / `swap_request` was enabled via the dashboard but not in migrations — a fresh replay wouldn't match live. (`email_event` was created with RLS on in the same migration, avoiding the repeat.)
6. **Housekeeping:** delete the `email_event` test row `svix_id = 'msg_2abc'`; commit the mission's files.

---
*Drafted with AI assistance; reviewed by Axl Joven. DOXA IN ACTION.*
