# Handoff — Trailhead Backend (AIOLabz Mission 4)

- **Owner:** Axl Joven (axl.joven@doxatalent.com)
- **Supervisor:** N/A — personal AIOLabz course project (Mission 4: "Wire the Stack")
- **Date:** 2026-08-22
- **AI assistance:** Built with AI assistance (Claude Code); reviewed by Axl Joven.
- **Next action:** Commit the pending files (list below), then set Vercel env vars and verify one deployed route.

---

## Goal
A shift-scheduling backend ("Trailhead", the course's coffee-chain example) on **Next.js 16 (App Router) + hosted Supabase (Postgres + RLS) + Vercel**. The point of the mission was **loop-prompting** — prompt, run, read the real output, feed it back — and proving security by *watching policies refuse*, not assuming they work.

## Where things live
- **App repo:** `~/Projects/aiolabz/mission-02-project/trailhead` (git repo root = app root). Remote: `github.com/Edge8-Axl/aiolabz-trailhead`, branch `main`.
- **Supabase:** hosted project `leistfxvavqcrkqbokcy.supabase.co`. All work done in the SQL Editor / dashboard (no local Docker stack).
- **Vercel:** connected to the GitHub repo, auto-deploys `main`. **Env vars NOT set yet** (see open items).
- **Secrets:** real keys in `.env.local` (gitignored); `.env.example` committed with placeholders. `.gitignore` has a `!.env.example` negation so the example is trackable while real env files stay ignored.

## Current state — built & VERIFIED (all via role-simulation / curl)
- **Schema (4 tables):** `location`, `staff` (sensitive: `phone`, `pay_band`; `user_id` = owner FK to `auth.users`), `shift`, `swap_request` (`requested_by` + `approved_by` are **staff.id** FKs, not user ids). IDs are uuid.
- **RLS policies, all proven in both directions:**
  - `staff`: full CRUD, all owner-scoped (`auth.uid() = user_id`). Verified non-owner 0 / owner 1 for update & delete.
  - `location`: `select to authenticated using (true)` (reference data, no owner concept).
  - `shift`: `select` scoped to caller's location via subquery on `staff`. Verified 2-of-3 seeded shifts (other location hidden).
  - `swap_request`: `swap_read_own` + `swap_insert_own` (requester = `requested_by in (select id from staff where user_id = auth.uid())`) **and** `swap_read_as_manager` (same-location `role='manager'`). Both branches of the OR'd SELECT verified.
- **Routes (`src/app/api/`):** `GET /me` (401/200/404, column allowlist — never returns phone/pay_band), `GET /shifts` (401/200, location-scoped), `POST /swap` (401/400/403/404/201; `requested_by` set from session, never the body). All three-way tested on `localhost`.
- **Client wiring:** `src/lib/supabase/server.ts` — cookie client (`createSupabaseServerClient`) + bearer-token client (`createSupabaseTokenClient`) so routes are curl-testable. Uses only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Secrets scan:** clean — no literal keys/JWTs/`service_role` values in tracked files.

## Key decisions (why, so they're not relitigated)
- **Hosted Supabase, not local** — skipped Docker; same RLS engine.
- **Approver = a `staff` row with `role='manager'` at the shift's location** (Option A: reuse existing columns, no schema change) — not a `manager_id` on `location`.
- **Test RLS via role simulation in the SQL Editor**, because the editor runs as `service_role` and *bypasses RLS entirely* — a plain editor query gives a false PASS. Always `set local role authenticated` + forge `request.jwt.claims` sub.
- **`service_role` key is never wired into any route** — it bypasses all RLS; kept out of code by discipline.
- Column allowlists in every route (explicit `select`, never `select *`) as defense-in-depth on top of RLS.

## Open questions / known-deferred (NOT failures — conscious scope calls)
1. **Approve flow not built.** `swap_request` has no `UPDATE` policy and no approve route — a manager can *read* a pending swap but can't approve it (set `status`/`approved_by`). This is the natural next feature.
2. **Migration drift.** RLS was enabled on `location`/`shift`/`swap_request` via the dashboard, but the migration files only `enable row level security` on `staff`. A fresh replay from migrations would NOT match the live DB. **Fix:** add a migration with `alter table … enable row level security` for the other three tables.
3. **`pay_band` is owner-editable.** RLS is row-level, so a user can edit their own pay band. Needs a column grant (`revoke update (pay_band) … from authenticated`) or route-level control.
4. **`GET /shifts` doesn't join staff names.** Showing coworkers on the schedule needs a name allowlist + a "same-location can read name" policy on `staff` (name yes, phone/pay_band never).
5. **Vercel env vars not set** → deployed DB-backed routes fail. Only `localhost` has been tested.

## How to resume / test
- **Dev server:** `cd trailhead && npm run dev` (port 3000).
- **Mint a test JWT (password grant):** `set -a && source .env.local && set +a`, then `curl "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"email":"…","password":"…"}' | jq -r .access_token` → export as `STAFF_TOKEN`. Call routes with `-H "Authorization: Bearer $STAFF_TOKEN"`.
- **RLS test pattern (SQL Editor):** wrap in `begin; … rollback;`, `select set_config('request.jwt.claims', json_build_object('sub', <user_id>, 'role','authenticated')::text, true);`, `set local role authenticated;`, then the query. Use a CTE ending in `select count(*)` so the count is the last result grid.

## Pending git (uncommitted at handoff)
Committed through `e5a8e60` (GET /me + init schema + staff base policies + seed). **Not yet committed:**
- `src/app/api/shifts/`, `src/app/api/swap/`
- `supabase/migrations/20260820110000_read_policies_location_shift.sql`
- `supabase/migrations/20260820113000_staff_update_delete_policies.sql`
- `supabase/migrations/20260820120000_swap_request_policies.sql`
- `supabase/seed_shifts.sql`, `supabase/seed_managers.sql`

Stage explicitly (no `git add .`):
`git add src/app/api/shifts src/app/api/swap supabase/migrations supabase/seed_shifts.sql supabase/seed_managers.sql`

---
*Drafted with AI assistance; reviewed by Axl Joven. DOXA IN ACTION.*
