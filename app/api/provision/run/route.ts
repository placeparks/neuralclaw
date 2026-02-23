import { NextResponse } from "next/server";
import { decryptToken } from "@/lib/token-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { provisionOnRailway } from "@/lib/railway-api";

type DeploymentRow = {
  id: string;
  user_email: string;
  agent_name: string;
  provider: "openai" | "anthropic" | "openrouter" | "local";
  provider_api_key_encrypted: string | null;
  model: string;
  plan: "monthly" | "yearly";
  status: string;
};

type ChannelRow = {
  channel: "telegram" | "discord" | "slack" | "whatsapp" | "signal";
  token_encrypted: string;
};

function sanitizeServiceName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function providerKeyEnvName(provider: DeploymentRow["provider"]): string | null {
  if (provider === "openai") {
    return "OPENAI_API_KEY";
  }
  if (provider === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }
  if (provider === "openrouter") {
    return "OPENROUTER_API_KEY";
  }
  return null;
}

function channelEnv(channels: ChannelRow[]): Record<string, string> {
  const out: Record<string, string> = {};

  for (const ch of channels) {
    const raw = decryptToken(ch.token_encrypted);

    if (ch.channel === "telegram") {
      out.NEURALCLAW_TELEGRAM_TOKEN = raw;
    } else if (ch.channel === "discord") {
      out.NEURALCLAW_DISCORD_TOKEN = raw;
    } else if (ch.channel === "slack") {
      // Accept either "xoxb|xapp" or single token for now
      const parts = raw.split("|").map((v) => v.trim()).filter(Boolean);
      if (parts.length >= 2) {
        out.NEURALCLAW_SLACK_BOT_API_KEY = parts[0];
        out.NEURALCLAW_SLACK_APP_API_KEY = parts[1];
      } else {
        out.NEURALCLAW_SLACK_BOT_API_KEY = raw;
      }
    } else if (ch.channel === "whatsapp") {
      out.NEURALCLAW_WHATSAPP_API_KEY = raw;
    } else if (ch.channel === "signal") {
      out.NEURALCLAW_SIGNAL_API_KEY = raw;
    }
  }

  return out;
}

async function processOne(deployment: DeploymentRow) {
  const supabase = getSupabaseAdmin();

  // Lock this row (best-effort single worker lock)
  const { data: locked, error: lockErr } = await supabase
    .from("deployments")
    .update({
      status: "provisioning",
      provisioning_started_at: new Date().toISOString(),
      provision_attempts: 1,
      error_message: null
    })
    .eq("id", deployment.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (lockErr) {
    throw new Error(lockErr.message);
  }
  if (!locked) {
    return { skipped: true, reason: "already claimed" };
  }

  const { data: channels, error: channelErr } = await supabase
    .from("deployment_channels")
    .select("channel, token_encrypted")
    .eq("deployment_id", deployment.id);

  if (channelErr || !channels) {
    throw new Error(channelErr?.message || "Unable to load deployment channels");
  }

  const servicePrefix = process.env.RAILWAY_SERVICE_PREFIX || "neuralclaw";
  const uniqueSuffix = deployment.id.split("-")[0];
  const serviceName = sanitizeServiceName(`${servicePrefix}-${deployment.agent_name}-${uniqueSuffix}`);

  const vars: Record<string, string> = {
    NEURALCLAW_PROVIDER: deployment.provider,
    NEURALCLAW_MODEL: deployment.model,
    NEURALCLAW_PLAN: deployment.plan,
    NEURALCLAW_USER_EMAIL: deployment.user_email,
    NEURALCLAW_AGENT_NAME: deployment.agent_name,
    ...channelEnv(channels as ChannelRow[])
  };

  const providerEnv = providerKeyEnvName(deployment.provider);
  if (providerEnv && deployment.provider_api_key_encrypted) {
    vars[providerEnv] = decryptToken(deployment.provider_api_key_encrypted);
  }

  const provisioned = await provisionOnRailway({
    serviceName,
    variables: vars
  });

  const { error: updateErr } = await supabase
    .from("deployments")
    .update({
      status: "active",
      railway_service_id: provisioned.serviceId,
      railway_deployment_id: provisioned.deploymentId,
      deployed_at: new Date().toISOString(),
      error_message: null
    })
    .eq("id", deployment.id);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return {
    deploymentId: deployment.id,
    serviceId: provisioned.serviceId,
    railwayDeploymentId: provisioned.deploymentId
  };
}

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.PROVISIONER_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-provisioner-secret");
      if (!provided || provided !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.max(1, Math.min(body.limit ?? 3, 10));

    const supabase = getSupabaseAdmin();
    const { data: pending, error: pendingErr } = await supabase
      .from("deployments")
      .select("id, user_email, agent_name, provider, provider_api_key_encrypted, model, plan, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (pendingErr) {
      return NextResponse.json({ error: pendingErr.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, results: [] });
    }

    const results = [] as Array<Record<string, unknown>>;

    for (const d of pending as DeploymentRow[]) {
      try {
        const r = await processOne(d);
        results.push({ ok: true, ...r });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase
          .from("deployments")
          .update({
            status: "failed",
            error_message: message,
            provision_attempts: 1
          })
          .eq("id", d.id);

        results.push({ ok: false, deploymentId: d.id, error: message });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected provisioner error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
