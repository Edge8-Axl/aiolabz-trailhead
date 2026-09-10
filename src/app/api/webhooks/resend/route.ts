import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// POST /api/webhooks/resend — receive Resend (Svix-signed) delivery events.
//
// Caller authentication happens FIRST: recompute the Svix signature over the
// EXACT raw bytes and reject anything that doesn't match, before parsing or
// writing. The insert uses the service_role admin client (bypasses RLS), so an
// unauthenticated POST here would be an admin write by a stranger — this
// signature check is the only thing standing in front of that.

const TOLERANCE_SECONDS = 5 * 60; // reject stale / replayed timestamps

function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Replay window: svix-timestamp is unix seconds. Reject anything outside it,
  // so a captured-and-replayed valid request can't be accepted forever.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  // Secret is "whsec_<base64>"; the signing key is the base64-decoded tail.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header is space-separated "v1,<sig> v2,<sig>"; accept if any v1 matches.
  return signatureHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // Read the RAW bytes first — the signature covers exactly what arrived over
  // the wire. req.json() would consume the body and re-serialization could
  // differ byte-for-byte, so there'd be nothing faithful left to verify.
  const raw = await req.text();

  if (!verifySvix(raw, req.headers, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // Only now is it safe to parse.
  let event: { type?: string; data?: { to?: string; email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("email_event").insert({
    svix_id: req.headers.get("svix-id"),
    type: event.type ?? "unknown",
    email: event.data?.to ?? null,
    message_id: event.data?.email_id ?? null,
  });

  // A unique-violation on svix_id means we've already stored this event — a
  // replay of a genuinely-signed request. Ack it (idempotent), don't 500.
  if (error && error.code !== "23505") {
    console.error(`[webhook] insert failed: ${error.message}`);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
