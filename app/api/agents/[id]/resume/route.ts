import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { redeployService } from "@/lib/railway-api";

// POST /api/agents/[id]/resume  { email }
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

    const { data: agent } = await supabase
      .from("agents")
      .select("id, railway_service_id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    if (agent.railway_service_id) {
      await redeployService(agent.railway_service_id);
    }

    const { error } = await supabase
      .from("agents")
      .update({ status: "active" })
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);

    await supabase.from("agent_events").insert({
      agent_id: params.id,
      event_type: "resumed",
      level: "info",
      message: "Agent resumed — redeploy triggered",
      metadata: { railway_service_id: agent.railway_service_id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
