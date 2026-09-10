// Transactional email channel (Resend) for Trailhead.
//
// One shared send core + thin per-event wrappers. The core owns the API key,
// the non-2xx error contract, and the message-id return; the wrappers only
// build the recipient + copy and delegate.
//
// Error contract (per Channel Card): on any non-2xx, log the HTTP status AND
// the provider's error text, and return an actionable failure — never a silent
// null the caller can't distinguish from success.
//
// PII: the barista's email lives in auth.users, NOT on staff. The name read is
// column-allowlisted (name only) and phone/pay_band are never touched.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's shared sender works for testing without a verified domain, but it
// can only deliver to your own Resend account email. Override once a domain is
// verified. See .env.example.
const RESEND_FROM = process.env.RESEND_FROM ?? "Trailhead <onboarding@resend.dev>";

export type SendOutcome =
  // A message was sent; `id` is the provider's message id (proof of send).
  | { ok: true; id: string }
  // Nothing to send — a valid no-op (e.g. swap still pending). Not a failure.
  | { ok: true; skipped: string }
  // Send failed; caller can log/retry/alert. status 0 = never reached provider.
  | { ok: false; status: number; error: string };

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * The one place that talks to Resend. Returns the provider's message id on a
 * 2xx, or a structured failure carrying the real HTTP status + error text.
 */
async function sendTransactional(input: EmailInput): Promise<SendOutcome> {
  if (!RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY is not set — cannot send");
    return { ok: false, status: 0, error: "RESEND_API_KEY not configured" };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
  } catch (e) {
    // Network-level failure — never reached the provider.
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[email] network error: ${error}`);
    return { ok: false, status: 0, error };
  }

  if (!res.ok) {
    const error = await res.text();
    console.error(`[email] send failed ${res.status}: ${error}`);
    return { ok: false, status: res.status, error };
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    // 2xx but no id — treat as a failure rather than reporting a phantom send.
    console.error(`[email] 2xx without message id: ${JSON.stringify(data)}`);
    return { ok: false, status: res.status, error: "no message id in response" };
  }
  return { ok: true, id: data.id };
}

/** Look up a staffer's email (auth.users) + name (staff, allowlisted). */
async function resolveRecipient(
  staffId: string,
): Promise<{ email: string; name: string } | null> {
  const admin = createSupabaseAdminClient();

  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("user_id, name") // allowlist: never phone / pay_band
    .eq("id", staffId)
    .maybeSingle();
  if (staffErr || !staff) return null;

  const { data: userRes, error: userErr } =
    await admin.auth.admin.getUserById(staff.user_id);
  if (userErr || !userRes.user?.email) return null;

  return { email: userRes.user.email, name: staff.name };
}

/**
 * Swap approved/denied → the requesting staffer. One channel, branched copy.
 * Sends nothing while the swap is still pending (a valid no-op, not an error).
 */
export async function sendSwapDecision(swapId: string): Promise<SendOutcome> {
  const admin = createSupabaseAdminClient();

  const { data: swap, error } = await admin
    .from("swap_request")
    .select("id, status, requested_by")
    .eq("id", swapId)
    .maybeSingle();
  if (error) return { ok: false, status: 0, error: error.message };
  if (!swap) return { ok: false, status: 0, error: "swap not found" };
  if (swap.status === "pending") return { ok: true, skipped: "pending" };

  const recipient = await resolveRecipient(swap.requested_by);
  if (!recipient) {
    return { ok: false, status: 0, error: "could not resolve recipient email" };
  }

  const approved = swap.status === "approved";
  const subject = approved
    ? "Your shift swap was approved"
    : "Your shift swap wasn't approved";
  const line = approved
    ? "Good news — your shift swap request has been approved."
    : "Your shift swap request wasn't approved this time.";

  return sendTransactional({
    to: recipient.email,
    subject,
    text: `Hi ${recipient.name},\n\n${line}\n\n— Trailhead`,
    html: `<p>Hi ${recipient.name},</p><p>${line}</p><p>— Trailhead</p>`,
  });
}

/**
 * Shift assigned/changed → the assigned staffer. Reuses the same email core.
 * Sends nothing for an unassigned shift (a valid no-op).
 */
export async function sendShiftAssigned(shiftId: string): Promise<SendOutcome> {
  const admin = createSupabaseAdminClient();

  const { data: shift, error } = await admin
    .from("shift")
    .select("id, staff_id, starts_at, ends_at")
    .eq("id", shiftId)
    .maybeSingle();
  if (error) return { ok: false, status: 0, error: error.message };
  if (!shift) return { ok: false, status: 0, error: "shift not found" };
  if (!shift.staff_id) return { ok: true, skipped: "unassigned" };

  const recipient = await resolveRecipient(shift.staff_id);
  if (!recipient) {
    return { ok: false, status: 0, error: "could not resolve recipient email" };
  }

  const when = new Date(shift.starts_at).toLocaleString();
  return sendTransactional({
    to: recipient.email,
    subject: "You've been added to a shift",
    text: `Hi ${recipient.name},\n\nYou're scheduled for a shift starting ${when}.\n\n— Trailhead`,
    html: `<p>Hi ${recipient.name},</p><p>You're scheduled for a shift starting ${when}.</p><p>— Trailhead</p>`,
  });
}
