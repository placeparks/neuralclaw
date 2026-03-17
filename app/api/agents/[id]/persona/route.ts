import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { updateRailwayService } from "@/lib/railway-api";

const DEFAULT_PERSONA =
  "You are NeuralClaw, a self-evolving cognitive AI agent with persistent memory and tool use capabilities.";

async function resolveAgentOwned(agentId: string, email: string) {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, railway_service_id, persona")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .single();
  return agent ?? null;
}

// GET /api/agents/[id]/persona?email=...
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const agent = await resolveAgentOwned(params.id, email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    return NextResponse.json({ persona: agent.persona ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

// POST /api/agents/[id]/persona  { email, persona }
// Pass persona: "" or null to reset to default.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; persona?: string };
    if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const agent = await resolveAgentOwned(params.id, body.email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    const persona = body.persona?.trim() || null;

    const supabase = getSupabaseAdmin();
    await supabase
      .from("agents")
      .update({ persona })
      .eq("id", params.id);

    let deploymentId: string | null = null;
    if (agent.railway_service_id) {
      const envValue = persona ?? DEFAULT_PERSONA;
      const deploy = await updateRailwayService({
        serviceId: agent.railway_service_id,
        variables: { NEURALCLAW_PERSONA: envValue },
      });
      deploymentId = deploy.deploymentId;
    }

    return NextResponse.json({ ok: true, persona, deploymentId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
