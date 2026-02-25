import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/agents/[id]/pause  { email }
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    if (!body.email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", body.email.toLowerCase())
      .single();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { error } = await supabase
      .from("agents")
      .update({ status: "paused" })
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);

    await supabase.from("agent_events").insert({
      agent_id: params.id,
      event_type: "paused",
      level: "info",
      message: "Agent paused by user",
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
