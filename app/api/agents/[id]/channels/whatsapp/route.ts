import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function resolveOwnedAgent(agentId: string, email: string) {
  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, railway_domain")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .single();

  return agent ?? null;
}

// GET /api/agents/[id]/channels/whatsapp?email=...
// Proxies runtime /channels/whatsapp for UI pairing/QR display.
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const agent = await resolveOwnedAgent(params.id, email);
    if (!agent) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    if (!agent.railway_domain) {
      return NextResponse.json({ enabled: false, connected: false, ready: false, qr: null });
    }

    try {
      const res = await fetch(`${agent.railway_domain}/channels/whatsapp`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return NextResponse.json({
          enabled: true,
          connected: false,
          ready: false,
          qr: null,
          reason: `runtime_http_${res.status}`,
        });
      }
      const data = await res.json();
      return NextResponse.json({
        enabled: Boolean(data.enabled),
        connected: Boolean(data.connected),
        ready: Boolean(data.ready),
        qr: typeof data.qr === "string" ? data.qr : null,
      });
    } catch {
      return NextResponse.json({
        enabled: true,
        connected: false,
        ready: false,
        qr: null,
        reason: "runtime_unreachable",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
