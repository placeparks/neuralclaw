import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  companionRelayHttpUrl,
  companionRelayWsUrl,
  hashCompanionToken,
  issueCompanionToken,
} from "@/lib/companion-pairing";
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

async function resolveOwnedAgent(agentId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id, agent_name, railway_service_id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .single();
  return data ?? null;
}

function serializeToken(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    token_hint: String(row.token_hint ?? ""),
    device_id: typeof row.device_id === "string" ? row.device_id : null,
    installation_id: typeof row.installation_id === "string" ? row.installation_id : null,
    device_name: typeof row.device_name === "string" ? row.device_name : null,
    capabilities: Array.isArray(row.capabilities)
      ? row.capabilities.map(String)
      : [],
    status: typeof row.status === "string" ? row.status : "issued",
    issued_at: typeof row.issued_at === "string" ? row.issued_at : null,
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
    revoked_at: typeof row.revoked_at === "string" ? row.revoked_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const user = await resolveUser(email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_companion_tokens")
      .select(
        "id, token_hint, device_id, installation_id, device_name, capabilities, status, issued_at, last_seen_at, expires_at, revoked_at, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      agent: {
        id: agent.id,
        agent_name: agent.agent_name,
        railway_service_id: agent.railway_service_id,
      },
      relayWsUrl: companionRelayWsUrl(),
      relayHttpUrl: companionRelayHttpUrl(),
      devices: (data ?? []).map((row) => serializeToken(row as Record<string, unknown>)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; expiresInHours?: number };
    if (!body.email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const user = await resolveUser(body.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const token = issueCompanionToken();
    const tokenHash = hashCompanionToken(token);
    const expiresInHours = Math.max(1, Math.min(Number(body.expiresInHours ?? 24), 24 * 30));
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const tokenHint = `${token.slice(0, 8)}...${token.slice(-6)}`;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_companion_tokens")
      .insert({
        agent_id: params.id,
        user_id: user.id,
        token_hash: tokenHash,
        token_hint: tokenHint,
        status: "issued",
        expires_at: expiresAt,
      })
      .select(
        "id, token_hint, device_id, installation_id, device_name, capabilities, status, issued_at, last_seen_at, expires_at, revoked_at, created_at, updated_at"
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to issue token" },
        { status: 500 }
      );
    }

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      token,
      relayWsUrl: companionRelayWsUrl(),
      relayHttpUrl: companionRelayHttpUrl(),
      device: serializeToken(data as Record<string, unknown>),
      warning: syncWarning,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; tokenId?: string };
    if (!body.email || !body.tokenId) {
      return NextResponse.json(
        { error: "email and tokenId are required" },
        { status: 400 }
      );
    }

    const user = await resolveUser(body.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agent_companion_tokens")
      .update({
        revoked_at: new Date().toISOString(),
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.tokenId)
      .eq("agent_id", params.id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
