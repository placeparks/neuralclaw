import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/token-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncAgentRuntimeEnv } from "@/lib/provisioner";

type ChannelKey = "telegram" | "discord" | "slack" | "whatsapp" | "signal";

const ALLOWED_CHANNELS: ChannelKey[] = ["telegram", "discord", "slack", "whatsapp", "signal"];

type ChannelInput = {
  channel: ChannelKey;
  enabled: boolean;
  token?: string;
};

type ChannelsRequestBody = {
  email?: string;
  channels?: ChannelInput[];
};

type ExistingChannel = {
  channel: ChannelKey;
  token_encrypted: string;
};

function validateChannelToken(channel: ChannelKey, token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return `token required for channel '${channel}'`;

  if (channel === "slack") {
    const parts = trimmed.split("|").map((v) => v.trim()).filter(Boolean);
    if (parts.length !== 2) {
      return "Slack requires both tokens in the format xoxb-...|xapp-....";
    }
    if (!parts[0].startsWith("xoxb-")) {
      return "Slack bot token must start with xoxb-.";
    }
    if (!parts[1].startsWith("xapp-")) {
      return "Slack app token must start with xapp-.";
    }
  }

  if (channel === "discord" && /\s/.test(trimmed)) {
    return "Discord bot token must not contain spaces.";
  }

  return null;
}

function isChannelKey(value: string): value is ChannelKey {
  return (ALLOWED_CHANNELS as string[]).includes(value);
}

type OwnedAgent = {
  userId: string;
  agentId: string;
  agentName: string;
};

async function resolveOwnedAgent(agentId: string, email: string): Promise<OwnedAgent | null> {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();

  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, agent_name")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .single();

  if (!agent) return null;
  return {
    userId: user.id,
    agentId: agent.id as string,
    agentName: (agent as { agent_name?: string | null }).agent_name ?? "agent",
  };
}

function normalizeInstanceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}


// GET /api/agents/[id]/channels?email=...
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const owned = await resolveOwnedAgent(params.id, email);
    if (!owned) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("agent_channels")
      .select("channel")
      .eq("agent_id", owned.agentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const enabled = new Set((rows ?? []).map((r: { channel: string }) => r.channel));

    return NextResponse.json({
      channels: ALLOWED_CHANNELS.map((channel) => ({
        channel,
        enabled: enabled.has(channel),
        hasToken: enabled.has(channel),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

// PUT /api/agents/[id]/channels { email, channels: [{channel, enabled, token?}] }
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as ChannelsRequestBody;
    if (!body.email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    if (!Array.isArray(body.channels)) {
      return NextResponse.json({ error: "channels array required" }, { status: 400 });
    }

    const normalized: ChannelInput[] = [];
    for (const row of body.channels) {
      if (!row || typeof row.channel !== "string" || typeof row.enabled !== "boolean") {
        return NextResponse.json({ error: "invalid channel payload" }, { status: 400 });
      }
      if (!isChannelKey(row.channel)) {
        return NextResponse.json({ error: `unsupported channel '${row.channel}'` }, { status: 400 });
      }
      normalized.push({
        channel: row.channel,
        enabled: row.enabled,
        token: typeof row.token === "string" ? row.token : undefined,
      });
    }

    const owned = await resolveOwnedAgent(params.id, body.email);
    if (!owned) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const { data: existingRows, error: existingErr } = await supabase
      .from("agent_channels")
      .select("channel, token_encrypted")
      .eq("agent_id", owned.agentId);

    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    const existingMap = new Map(
      ((existingRows ?? []) as ExistingChannel[]).map((row) => [row.channel, row.token_encrypted])
    );

    const autoWhatsAppToken = normalizeInstanceName(`${owned.agentName}-${owned.agentId.slice(0, 8)}-wa`);

    const nextRows = [] as Array<{ agent_id: string; channel: ChannelKey; token_encrypted: string }>;
    for (const row of normalized.filter((r) => r.enabled)) {
      const incoming = row.token?.trim() ?? "";
      const existing = existingMap.get(row.channel);
      let token = incoming || "";

      if (!token && row.channel === "whatsapp" && !existing) {
        token = autoWhatsAppToken;
      }

      if (token) {
        const validationError = validateChannelToken(row.channel, token);
        if (validationError) {
          return NextResponse.json({ error: validationError }, { status: 400 });
        }
      }

      const tokenEncrypted = token ? encryptToken(token) : existing;
      nextRows.push({
        agent_id: owned.agentId,
        channel: row.channel,
        token_encrypted: tokenEncrypted ?? "",
      });
    }

    const missingToken = nextRows.find((row) => !row.token_encrypted);
    if (missingToken) {
      return NextResponse.json(
        { error: `token required for channel '${missingToken.channel}'` },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await supabase
      .from("agent_channels")
      .delete()
      .eq("agent_id", owned.agentId);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    if (nextRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("agent_channels")
        .insert(nextRows);

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const syncResult = await syncAgentRuntimeEnv(owned.agentId);

    return NextResponse.json({
      ok: true,
      deploymentId: syncResult.deploymentId,
      autoProvisionedWhatsApp:
        normalized.some((r) => r.channel === "whatsapp" && r.enabled) &&
        !normalized.some((r) => r.channel === "whatsapp" && (r.token?.trim() ?? "").length > 0),
      channels: ALLOWED_CHANNELS.map((channel) => ({
        channel,
        enabled: nextRows.some((row) => row.channel === channel),
        hasToken: nextRows.some((row) => row.channel === channel),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
