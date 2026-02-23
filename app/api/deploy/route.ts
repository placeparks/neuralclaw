import { NextResponse } from "next/server";
import { runProvision } from "@/lib/provisioner";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { encryptToken } from "@/lib/token-crypto";
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

    const { data: deployment, error: deployErr } = await supabase
      .from("deployments")
      .insert({
        user_email: body.userEmail,
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
      deployment_id: deployment.id,
      channel: ch.channel,
      token_encrypted: encryptToken(ch.token)
    }));

    const { error: channelErr } = await supabase.from("deployment_channels").insert(channelRows);

    if (channelErr) {
      return NextResponse.json({ error: channelErr.message }, { status: 500 });
    }

    let autoProvisionTriggered = true;
    let autoProvisionError = "";

    try {
      await runProvision(1);
    } catch (e) {
      autoProvisionTriggered = false;
      autoProvisionError = e instanceof Error ? e.message : String(e);
      console.error("[deploy] auto-provision trigger failed", autoProvisionError);
    }

    return NextResponse.json({
      ok: true,
      deploymentId: deployment.id,
      message: autoProvisionTriggered
        ? "Deployment queued and provisioning triggered"
        : "Deployment queued but auto-provision trigger failed; call /api/provision/run",
      autoProvisionTriggered,
      autoProvisionError: autoProvisionError || undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
