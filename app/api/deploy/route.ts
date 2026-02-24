import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { encryptToken } from "@/lib/token-crypto";
import { runProvision } from "@/lib/provisioner";
import type { DeploymentRequest } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DeploymentRequest;

    if (!body.userEmail || !body.agentName || !body.plan || !body.provider || !body.model || !body.region) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (body.provider !== "local" && !body.providerApiKey) {
      return NextResponse.json({ error: "Provider API key is required for hosted models." }, { status: 400 });
    }

    if (!Array.isArray(body.channels) || body.channels.length === 0) {
      return NextResponse.json({ error: "At least one channel is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const email = body.userEmail.trim().toLowerCase();
    const { data: user } = await supabase
      .from("app_users")
      .select("id, display_name")
      .eq("email", email)
      .maybeSingle();

    let userId = user?.id || null;

    if (!userId) {
      const fallbackName = email.split("@")[0] || "user";
      const createUser = await supabase
        .from("app_users")
        .insert({
          email,
          display_name: fallbackName,
          password_hash: "legacy",
          password_salt: "legacy"
        })
        .select("id")
        .single();

      if (createUser.error || !createUser.data) {
        return NextResponse.json({ error: createUser.error?.message || "Failed to resolve user." }, { status: 500 });
      }
      userId = createUser.data.id;
    }

    const { data: deployment, error: deployErr } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        agent_name: body.agentName,
        plan: body.plan,
        provider: body.provider,
        provider_api_key_encrypted: body.providerApiKey ? encryptToken(body.providerApiKey) : null,
        model: body.model,
        region: body.region,
        status: "pending",
        error_message: null
      })
      .select("id")
      .single();

    if (deployErr || !deployment) {
      return NextResponse.json({ error: deployErr?.message || "Failed to create deployment." }, { status: 500 });
    }

    const channelRows = body.channels.map((ch) => ({
      agent_id: deployment.id,
      channel: ch.channel,
      token_encrypted: encryptToken(ch.token)
    }));

    const { error: channelErr } = await supabase.from("agent_channels").insert(channelRows);

    if (channelErr) {
      return NextResponse.json({ error: channelErr.message }, { status: 500 });
    }

    let triggerWarning: string | null = null;
    try {
      await runProvision(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      triggerWarning = `auto-provision trigger failed: ${message}`;
    }

    return NextResponse.json({
      ok: true,
      deploymentId: deployment.id,
      message: triggerWarning
        ? "Deployment queued. Auto-trigger failed; background scheduler should pick it up."
        : "Deployment queued and provisioner triggered.",
      warning: triggerWarning
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
