import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { deleteRailwayService } from "@/lib/railway-api";

// DELETE /api/agents/[id]  { email }
export async function DELETE(
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

    const { data: agent } = await supabase
      .from("agents")
      .select("id, user_id, railway_service_id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    // Best-effort Railway deletion — don't block if Railway API fails
    if (agent.railway_service_id) {
      try {
        await deleteRailwayService(agent.railway_service_id);
      } catch (e) {
        console.error("[delete-agent] Railway service delete failed:", e);
      }
    }

    // Cascade in schema handles agent_channels, mesh_links, agent_events
    const { error } = await supabase.from("agents").delete().eq("id", params.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
