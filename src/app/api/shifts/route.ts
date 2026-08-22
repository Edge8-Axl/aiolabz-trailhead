import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseTokenClient,
} from "@/lib/supabase/server";

// GET /shifts — lists shifts for the signed-in caller's own location.
// - No / invalid session -> 401 (gate before any DB query)
// - Session -> 200 with the caller's location's shifts only (RLS scopes rows)
// An empty list is a 200 with [], not a 404 — "no shifts" is success, not a miss.
export async function GET(req: NextRequest) {
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

  // Explicit allowlist — never `select *`. The `shift_read_own_location` RLS
  // policy already restricts rows to the caller's location; this restricts
  // columns. (A staff-name join is a deliberate later step: it needs its own
  // allowlist AND a same-location read policy on staff, so it's not baked in
  // here where a careless embed could pull phone/pay_band.)
  const { data, error } = await supabase
    .from("shift")
    .select("id, starts_at, ends_at, location_id, staff_id")
    .order("starts_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({ shifts: data ?? [] }, { status: 200 });
}
