import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function resolveUser(email: string) {
  const supabase = getSupabaseAdmin();
  return supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const user = await resolveUser(email);
  if (user.error) return NextResponse.json({ error: user.error.message }, { status: 500 });
  if (!user.data) return NextResponse.json({ links: [] });

  const supabase = getSupabaseAdmin();
  const links = await supabase
    .from("mesh_links")
    .select("id, source_agent_id, target_agent_id, permission, enabled, created_at")
    .eq("user_id", user.data.id)
    .order("created_at", { ascending: false });

  if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 });
  return NextResponse.json({ links: links.data ?? [] });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      sourceAgentId?: string;
      targetAgentId?: string;
      permission?: "delegate" | "read_only" | "blocked";
      enabled?: boolean;
    };
    const email = (body.email || "").trim().toLowerCase();
    if (!email || !body.sourceAgentId || !body.targetAgentId) {
      return NextResponse.json({ error: "email, sourceAgentId, targetAgentId are required" }, { status: 400 });
    }
    if (body.sourceAgentId === body.targetAgentId) {
      return NextResponse.json({ error: "Source and target cannot be same" }, { status: 400 });
    }

    const user = await resolveUser(email);
    if (user.error) return NextResponse.json({ error: user.error.message }, { status: 500 });
    if (!user.data) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const ownsAgents = await supabase
      .from("agents")
      .select("id")
      .in("id", [body.sourceAgentId, body.targetAgentId])
      .eq("user_id", user.data.id);
    if (ownsAgents.error) return NextResponse.json({ error: ownsAgents.error.message }, { status: 500 });
    if ((ownsAgents.data ?? []).length !== 2) {
      return NextResponse.json({ error: "Agents must belong to the same user" }, { status: 400 });
    }

    const upsert = await supabase
      .from("mesh_links")
      .upsert({
        user_id: user.data.id,
        source_agent_id: body.sourceAgentId,
        target_agent_id: body.targetAgentId,
        permission: body.permission || "delegate",
        enabled: body.enabled ?? true
      }, { onConflict: "source_agent_id,target_agent_id" })
      .select("id, source_agent_id, target_agent_id, permission, enabled, created_at")
      .single();

    if (upsert.error || !upsert.data) {
      return NextResponse.json({ error: upsert.error?.message || "Failed to save link" }, { status: 500 });
    }

    await supabase.from("agent_events").insert({
      agent_id: body.sourceAgentId,
      event_type: "mesh_link_upserted",
      level: "info",
      message: `Mesh link ${body.sourceAgentId} -> ${body.targetAgentId} (${body.permission || "delegate"})`,
      metadata: {
        target_agent_id: body.targetAgentId,
        permission: body.permission || "delegate",
        enabled: body.enabled ?? true
      }
    });

    return NextResponse.json({ link: upsert.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; linkId?: string };
    const email = (body.email || "").trim().toLowerCase();
    if (!email || !body.linkId) return NextResponse.json({ error: "email and linkId are required" }, { status: 400 });

    const user = await resolveUser(email);
    if (user.error) return NextResponse.json({ error: user.error.message }, { status: 500 });
    if (!user.data) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const removed = await supabase
      .from("mesh_links")
      .delete()
      .eq("id", body.linkId)
      .eq("user_id", user.data.id)
      .select("id")
      .maybeSingle();

    if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
