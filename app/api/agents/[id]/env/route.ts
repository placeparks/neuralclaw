import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { updateRailwayService } from "@/lib/railway-api";

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
    .select("id, railway_service_id, custom_env")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .single();
  return agent ?? null;
}

// GET /api/agents/[id]/env?email=...
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const agent = await resolveAgentOwned(params.id, email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    return NextResponse.json({ vars: (agent.custom_env as Record<string, string>) ?? {} });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

// POST /api/agents/[id]/env  { email, key, value }  — upsert one variable
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; key?: string; value?: string };
    if (!body.email || !body.key) {
      return NextResponse.json({ error: "email and key are required" }, { status: 400 });
    }
    const key = body.key.trim();
    const value = body.value ?? "";

    const agent = await resolveAgentOwned(params.id, body.email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    const updated: Record<string, string> = { ...(agent.custom_env as Record<string, string> ?? {}), [key]: value };

    const supabase = getSupabaseAdmin();
    await supabase.from("agents").update({ custom_env: updated }).eq("id", params.id);

    let deploymentId: string | null = null;
    if (agent.railway_service_id) {
      const deploy = await updateRailwayService({
        serviceId: agent.railway_service_id,
        variables: { [key]: value },
      });
      deploymentId = deploy.deploymentId;
    }

    return NextResponse.json({ ok: true, vars: updated, deploymentId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/env  { email, key }  — remove one variable
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; key?: string };
    if (!body.email || !body.key) {
      return NextResponse.json({ error: "email and key are required" }, { status: 400 });
    }

    const agent = await resolveAgentOwned(params.id, body.email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    const updated: Record<string, string> = { ...(agent.custom_env as Record<string, string> ?? {}) };
    delete updated[body.key];

    const supabase = getSupabaseAdmin();
    await supabase.from("agents").update({ custom_env: updated }).eq("id", params.id);

    // Set to empty string on Railway (effectively unsets it for the agent)
    if (agent.railway_service_id) {
      await updateRailwayService({
        serviceId: agent.railway_service_id,
        variables: { [body.key]: "" },
      });
    }

    return NextResponse.json({ ok: true, vars: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
