import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { decryptToken } from "@/lib/token-crypto";

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

function resolveEvolutionConfig(customEnv: Record<string, string>): EvolutionConfig | null {
  const baseUrl =
    customEnv.NEURALCLAW_WHATSAPP_BRIDGE_URL ||
    process.env.NEURALCLAW_WHATSAPP_BRIDGE_URL ||
    process.env.EVOLUTION_API_URL ||
    "";
  const apiKey =
    customEnv.NEURALCLAW_WHATSAPP_BRIDGE_API_KEY ||
    process.env.NEURALCLAW_WHATSAPP_BRIDGE_API_KEY ||
    process.env.EVOLUTION_API_KEY ||
    process.env.AUTHENTICATION_API_KEY ||
    "";

  if (!baseUrl || !apiKey) {
    return null;
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

function pickQr(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  const qrcode = (root.qrcode && typeof root.qrcode === "object")
    ? (root.qrcode as Record<string, unknown>)
    : null;

  const candidates: Array<unknown> = [
    root.base64,
    root.qr,
    root.code,
    qrcode?.base64,
    qrcode?.qr,
    qrcode?.code,
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) return trimmed;
    // If looks like raw base64 image payload, normalize for img tag use.
    if (/^[a-zA-Z0-9+/=]+$/.test(trimmed) && trimmed.length > 120) {
      return `data:image/png;base64,${trimmed}`;
    }
    return trimmed;
  }
  return null;
}

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
    .select("id, railway_domain, custom_env")
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
      return NextResponse.json({ enabled: false, connected: false, ready: false, qr: null, reason: "runtime_missing" });
    }

    const customEnv = ((agent as { custom_env?: Record<string, string> | null }).custom_env ?? {}) as Record<string, string>;
    const evolutionConfig = resolveEvolutionConfig(customEnv);
    const { data: channelRow } = await getSupabaseAdmin()
      .from("agent_channels")
      .select("token_encrypted")
      .eq("agent_id", agent.id)
      .eq("channel", "whatsapp")
      .maybeSingle();
    const instanceName = channelRow?.token_encrypted ? decryptToken(channelRow.token_encrypted) : "";

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
      const runtimeState = {
        enabled: Boolean(data.enabled),
        connected: Boolean(data.connected),
        ready: Boolean(data.ready),
        qr: typeof data.qr === "string" ? data.qr : null,
      };
      if (runtimeState.qr || runtimeState.connected || !instanceName || !evolutionConfig) {
        return NextResponse.json(runtimeState);
      }

      // Fallback: pull QR directly from Evolution so dashboard can show pairing code.
      try {
        const evoRes = await fetch(
          `${evolutionConfig.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
          { headers: { apikey: evolutionConfig.apiKey }, signal: AbortSignal.timeout(8000) }
        );
        if (evoRes.ok) {
          const evoData = await evoRes.json().catch(() => null);
          const qr = pickQr(evoData);
          if (qr) {
            return NextResponse.json({
              ...runtimeState,
              qr,
              reason: "qr_from_evolution",
            });
          }
        }
      } catch {
        // Keep runtime state as-is.
      }
      return NextResponse.json(runtimeState);
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
