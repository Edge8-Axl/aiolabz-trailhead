import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseTokenClient,
} from "@/lib/supabase/server";

// GET /me — returns the signed-in caller's own staff profile.
// - No / invalid session  -> 401 (gate runs BEFORE any DB query)
// - Session but no staff row for this user -> 404
// - Session + own row     -> 200 with an explicit column allowlist
export async function GET(req: NextRequest) {
  // Prefer a Bearer token (API / curl); fall back to the cookie session (browser).
  const authHeader = req.headers.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

  const supabase = bearer
    ? createSupabaseTokenClient(bearer)
    : await createSupabaseServerClient();

  // Gate first — never query the database for an unauthenticated caller.
  // A garbage/expired token also lands here (getUser rejects it) -> 401.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Explicit allowlist — never `select *`. phone and pay_band are deliberately
  // omitted from this response; add them only if the design says the owner
  // should see their own. This is the column-level leak guard in code.
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, role, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "no_staff_profile" }, { status: 404 });
  }

  return NextResponse.json({ staff: data }, { status: 200 });
}
