import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/agents/[id]/health?email=...
// Proxies to the agent's /health endpoint and returns event count.
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data: agent } = await supabase
      .from("agents")
      .select("railway_domain, status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    // Event count is always available regardless of online status
    const { count: eventCount } = await supabase
      .from("agent_events")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", params.id);

    if (!agent.railway_domain) {
      return NextResponse.json({ online: false, reason: "no_domain", eventCount: eventCount ?? 0 });
    }

    try {
      const res = await fetch(`${agent.railway_domain}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return NextResponse.json({ online: true, eventCount: eventCount ?? 0, ...data });
      }
      return NextResponse.json({
        online: false,
        reason: `http_${res.status}`,
        eventCount: eventCount ?? 0,
      });
    } catch {
      return NextResponse.json({ online: false, reason: "unreachable", eventCount: eventCount ?? 0 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
