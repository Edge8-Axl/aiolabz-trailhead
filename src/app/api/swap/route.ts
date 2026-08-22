import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseTokenClient,
} from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /swap — create a swap request for a shift.
// - No / invalid session      -> 401
// - Missing/malformed shift_id -> 400
// - Caller has no staff row    -> 403
// - Shift missing or not at caller's location (RLS hides it) -> 404
// - Success                    -> 201 { swap: { id, status } }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

  const supabase = bearer
    ? createSupabaseTokenClient(bearer)
    : await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate the body. A malformed/absent shift_id is a 400, not a 500.
  const body = await req.json().catch(() => null);
  const shiftId = body?.shift_id;
  if (typeof shiftId !== "string" || !UUID_RE.test(shiftId)) {
    return NextResponse.json(
      { error: "valid shift_id is required" },
      { status: 400 },
    );
  }

  // requested_by comes from the SESSION, never the request body.
  const { data: staffRow, error: staffErr } = await supabase
    .from("staff")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (staffErr) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!staffRow) {
    return NextResponse.json({ error: "no_staff_profile" }, { status: 403 });
  }

  // Shift must exist AND be visible to the caller. RLS on `shift` scopes to the
  // caller's location, so a nonexistent id and an other-location id both come
  // back empty -> 404 (never letting you file a swap against a shift you can't see).
  const { data: shiftRow, error: shiftErr } = await supabase
    .from("shift")
    .select("id")
    .eq("id", shiftId)
    .maybeSingle();
  if (shiftErr) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!shiftRow) {
    return NextResponse.json({ error: "shift_not_found" }, { status: 404 });
  }

  const { data: created, error: insertErr } = await supabase
    .from("swap_request")
    .insert({ shift_id: shiftId, requested_by: staffRow.id })
    .select("id, status")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ swap: created }, { status: 201 });
}
