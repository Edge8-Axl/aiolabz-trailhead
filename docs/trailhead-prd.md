# Trailhead — Product Requirements (v1, post-demo)

- **Owner:** Axl Joven (axl.joven@doxatalent.com)
- **Supervisor:** N/A — personal AIOLabz course project ("Prove" mission)
- **Date:** 2026-08-25
- **AI assistance:** Drafted with AI assistance (Claude Code); reviewed by Axl Joven. DOXA IN ACTION.
- **Status:** Backend runs on localhost; not deployed. Validated in **simulation** (no real stakeholder available). Findings below came from a demo + a role-played client conversation.

---

## 1. What it does (one sentence)

Trailhead is the backend for a coffee chain's shift scheduling: baristas sign in to see their own profile and their store's shifts, request to swap a shift, and get notified when a swap is decided — with access rules that make sure each person only sees and touches what belongs to them or their store.

## 2. Who it's for

- **Baristas** — default role (`staff.role = 'barista'`), scoped by access rules to their own row and their own location.
- **Managers** — `role = 'manager'`; everything a barista can do, plus **read-only** visibility into their store's swap requests. *No approve/decline action is built yet.*
- **Resend (provider system)** — not a person; POSTs delivery events to `/api/webhooks/resend`, authenticates by Svix signature, writes only to `email_event`.

## 3. Scope

**In scope (claimed to work):**
- Authenticated reads, scoped by access rules: `GET /me` (column-allowlisted — never `phone`/`pay_band`), `GET /shifts` (own store only).
- Swap creation: `POST /swap`, with `requested_by` taken from the session, never the request body.
- Access enforcement — two guardrails: row-level security hides rows the caller shouldn't see (reads), and session-derived identity stops a caller forging ownership (writes).
- Transactional email for swap decisions + shift assignment (built and executed against Resend).
- Inbound webhook verified by Svix signature before any write, replay-idempotent via unique `svix_id`.

**Out of scope (explicitly not claimed):**
- The approve/decline **action** (no route, no UPDATE policy) — a manager can see a pending swap but can't act on it in-app.
- SMS/phone notifications (`phone` is sensitive PII, deliberately avoided).
- Mass outreach (Brevo) and outbound Slack (reasoned, not built).
- Scheduled jobs / cron (sends are event-driven only).
- Shift **creation/assignment** in-app — `GET /shifts` is read-only; shifts exist only via seeding.
- Deployment (localhost only; Vercel env vars not set).
- Coworker names on the schedule; `pay_band` edit controls.

## 4. Acceptance criteria (one binary test per in-scope item)

| Item | True/false test |
|---|---|
| Authenticated reads | Signed-in `GET /me` returns the profile with **no** `phone`/`pay_band`; unauthenticated → `401`. |
| Swap creation | `POST /swap` → `201`, and the row's `requested_by` = the **session's** staff id, not the body's. |
| Access enforcement | A caller requesting another user's row or another store's shift gets **zero rows**, never the data. |
| Transactional email — component (✅ true) | Invoking the send function directly returns a real Resend `200` + message id, and the mail **lands in the inbox**. |
| Transactional email — end-to-end (❌ not met) | A swap decision made *in the product* causes the requester to receive an email. **False today** — no action fires the sender ("engine on the bench"; blocked on approve). |
| Inbound webhook | A correctly-signed POST → `200`, writes exactly one `email_event`; forged/tampered → `401`, writes nothing. |

## 5. Rewritten spec sentences (specification as the deliverable)

**5a. Access-rule reproducibility (fixes the migration drift).**
> Every table's row-level security *and* its policies are defined in a version-controlled migration, never only in the dashboard. Applying the migrations to an empty database must reproduce the exact enforced state — RLS enabled with policies on `staff`, `location`, `shift`, `swap_request`. Any table a from-migrations rebuild leaves with RLS off, or on with no policy, is a failure to fix now, not a deferred task.
> **Test:** `supabase db reset` → run the RLS role-simulation suite → every wrong-caller check still returns zero rows on a hand-untouched database.

**5b. Shift templates (agreed later — build sentence for whoever picks it up).**
> A manager assigned to a location may generate a new week by copying a prior week's shifts *for that same location* — producing new `shift` rows with fresh dates carrying only shift data, never the copied week's swap requests, decisions, or notifications; a barista cannot create or copy shifts, a manager cannot copy into a location they aren't assigned to, and no copy may write a shift into another store — that cross-location or non-manager write is the case to refuse.
> Access rule ships **in a migration** (RLS with a manager-and-same-location policy); a barista or out-of-location manager attempting the copy creates **zero** rows, provable on a from-source rebuild.

## 6. Feedback Summary (Source: `Simulation` — none promotes to customer evidence)

| Insight | Evidence | Source |
|---|---|---|
| "Manager sees but can't act" reads as stuck/broken to a non-technical client unless framed as "not built yet; decision still happens outside the app." | Client asked directly whether it was a bug. | Simulation |
| Shift templates (copy-last-week) is a real want, but it's **new scope**, not an extension of swap-handling, and needs its own spec. | Client raised it unprompted as an obvious win. | Simulation |
| Manager alerting doesn't exist: Dana finds a pending swap only by opening Trailhead and looking. | Surfaced under "what happens if something breaks." | Simulation |
| Failed notification sends are invisible to the client today — logged only where a technical person would look. | Same "what breaks" exchange. | Simulation |
| Top priority before trusting real staff data is making the privacy floor **permanent and provable**, not the approve button. | Client named it when asked "what one thing first." | Simulation |
| The unread-inbox assumption survived unchallenged; the client's "my real staff" (hourly baristas) makes it *more* load-bearing. | Client repeatedly referenced real staff, never asked about email habits. | Simulation |
| The inbox assumption is really two: "address is real" is partly detectable now via the webhook's `bounced` events; "a person reads it" is still completely blind. | Surfaced tracing whether the assumption survived. | Simulation |

## 7. Priority order (what's irreversible gets fixed before what's merely inconvenient)

1. **Privacy floor — permanent and provable** (spec 5a). A crack means someone sees a coworker's pay/phone; that's the one mistake you can't take back.
2. **Approve/decline action** — closes the swap loop; the notification path already works, only the trigger is missing.
3. **Failure-visibility** — retries + something that surfaces a failed/undelivered notification instead of a silent log line.

## 8. Open risks / prerequisites

- **Unread-inbox assumption** (two-part, per §6) — only real staff can close it; watch `bounced` events as the cheap early warning for dead addresses.
- **No deployment** — Vercel env vars unset; only localhost proven.
- **Migration drift** — until 5a ships, live security is dashboard state, not source.
- **`service_role` in the notifier** — powerful cross-user read; isolated and documented, but its guardrail depends on 5a holding.
- **Retry/queue for the 429/5xx email path** — currently reports failure, does not recover; this is the mitigation for the highest-blast-radius silent failure (shift-assignment notifications).

---
*Drafted with AI assistance; reviewed by Axl Joven. DOXA IN ACTION.*
