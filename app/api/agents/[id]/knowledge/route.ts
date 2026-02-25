import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncMeshEnvForUser } from "@/lib/provisioner";

async function resolveUser(email: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data ?? null;
}

async function verifyAgentOwnership(agentId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .single();
  return Boolean(data);
}

// GET /api/agents/[id]/knowledge?email=...
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const user = await resolveUser(email);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    if (!(await verifyAgentOwnership(params.id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_knowledge")
      .select("id, title, content, created_at")
      .eq("agent_id", params.id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ docs: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

// POST /api/agents/[id]/knowledge  { email, title, content }
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; title?: string; content?: string };
    if (!body.email || !body.title?.trim() || !body.content?.trim()) {
      return NextResponse.json({ error: "email, title, and content are required" }, { status: 400 });
    }

    const user = await resolveUser(body.email);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    if (!(await verifyAgentOwnership(params.id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data: doc, error } = await supabase
      .from("agent_knowledge")
      .insert({
        agent_id: params.id,
        user_id: user.id,
        title: body.title.trim(),
        content: body.content.trim(),
      })
      .select("id, title, content, created_at")
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    // Re-sync Railway env so NEURALCLAW_KNOWLEDGE_CONTENT is updated
    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({ doc, warning: syncWarning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/knowledge  { email, docId }
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; docId?: string };
    if (!body.email || !body.docId) {
      return NextResponse.json({ error: "email and docId are required" }, { status: 400 });
    }

    const user = await resolveUser(body.email);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const supabase = getSupabaseAdmin();
    await supabase
      .from("agent_knowledge")
      .delete()
      .eq("id", body.docId)
      .eq("agent_id", params.id)
      .eq("user_id", user.id);

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({ ok: true, warning: syncWarning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
