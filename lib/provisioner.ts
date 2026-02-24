import { decryptToken } from "@/lib/token-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { provisionOnRailway, updateRailwayService } from "@/lib/railway-api";

type DeploymentRow = {
  id: string;
  user_id: string;
  agent_name: string;
  provider: "openai" | "anthropic" | "openrouter" | "local";
  provider_api_key_encrypted: string | null;
  model: string;
  plan: "monthly" | "yearly";
};

type ChannelRow = {
  channel: "telegram" | "discord" | "slack" | "whatsapp" | "signal";
  token_encrypted: string;
};

type MeshLinkRow = {
  target_agent_id: string;
  permission: "delegate" | "read_only" | "blocked";
  enabled: boolean;
};

type MeshPeerAgentRow = {
  id: string;
  agent_name: string;
  status: string;
  railway_service_id: string | null;
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

async function buildMeshEnvForAgent(userId: string, sourceAgentId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();

  const { data: userRow, error: userErr } = await supabase
    .from("app_users")
    .select("mesh_enabled")
    .eq("id", userId)
    .single();

  if (userErr || !userRow) {
    throw new Error(userErr?.message || "Unable to load user mesh settings");
  }

  const vars: Record<string, string> = {
    NEURALCLAW_MESH_ENABLED: userRow.mesh_enabled ? "true" : "false",
    NEURALCLAW_MESH_PEERS_JSON: ""
  };

  if (!userRow.mesh_enabled) {
    return vars;
  }

  const meshRows = await supabase
    .from("mesh_links")
    .select("target_agent_id, permission, enabled")
    .eq("user_id", userId)
    .eq("source_agent_id", sourceAgentId)
    .eq("enabled", true);

  if (meshRows.error || !meshRows.data) {
    throw new Error(meshRows.error?.message || "Unable to load mesh links");
  }

  const links = (meshRows.data as MeshLinkRow[]).filter((l) => l.permission !== "blocked");
  if (links.length === 0) {
    return vars;
  }

  const targetIds = links.map((l) => l.target_agent_id);
  const targets = await supabase
    .from("agents")
    .select("id, agent_name, status, railway_service_id")
    .in("id", targetIds);

  if (targets.error || !targets.data) {
    throw new Error(targets.error?.message || "Unable to load mesh peer targets");
  }

  const targetMap = new Map((targets.data as MeshPeerAgentRow[]).map((t) => [t.id, t]));
  const peers = links
    .map((link) => {
      const target = targetMap.get(link.target_agent_id);
      if (!target) return null;
      return {
        agentId: target.id,
        agentName: target.agent_name,
        permission: link.permission,
        status: target.status,
        railwayServiceId: target.railway_service_id
      };
    })
    .filter(
      (
        peer
      ): peer is {
        agentId: string;
        agentName: string;
        permission: "delegate" | "read_only" | "blocked";
        status: string;
        railwayServiceId: string | null;
      } => Boolean(peer)
    );

  vars.NEURALCLAW_MESH_PEERS_JSON = peers.length > 0 ? JSON.stringify(peers) : "";
  return vars;
}

async function processOne(deployment: DeploymentRow) {
  const supabase = getSupabaseAdmin();

  const { data: locked, error: lockErr } = await supabase
    .from("agents")
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
    .from("agent_channels")
    .select("channel, token_encrypted")
    .eq("agent_id", deployment.id);

  if (channelErr || !channels) {
    throw new Error(channelErr?.message || "Unable to load deployment channels");
  }

  const servicePrefix = process.env.RAILWAY_SERVICE_PREFIX || "neuralclaw";
  const uniqueSuffix = deployment.id.split("-")[0];
  const serviceName = sanitizeServiceName(`${servicePrefix}-${deployment.agent_name}-${uniqueSuffix}`);

  const { data: userRow, error: userErr } = await supabase
    .from("app_users")
    .select("email, mesh_enabled")
    .eq("id", deployment.user_id)
    .single();

  if (userErr || !userRow) {
    throw new Error(userErr?.message || "Unable to load user for deployment");
  }

  const vars: Record<string, string> = {
    NEURALCLAW_PROVIDER: deployment.provider,
    NEURALCLAW_MODEL: deployment.model,
    NEURALCLAW_PLAN: deployment.plan,
    NEURALCLAW_USER_EMAIL: userRow.email,
    NEURALCLAW_AGENT_NAME: deployment.agent_name,
    ...channelEnv(channels as ChannelRow[])
  };

  const meshVars = await buildMeshEnvForAgent(deployment.user_id, deployment.id);
  Object.assign(vars, meshVars);

  const providerEnv = providerKeyEnvName(deployment.provider);
  if (providerEnv && deployment.provider_api_key_encrypted) {
    vars[providerEnv] = decryptToken(deployment.provider_api_key_encrypted);
  }

  const provisioned = await provisionOnRailway({
    serviceName,
    variables: vars
  });

  const { error: updateErr } = await supabase
    .from("agents")
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

  await supabase.from("agent_events").insert({
    agent_id: deployment.id,
    event_type: "provisioned",
    level: "info",
    message: "Agent provisioned successfully",
    metadata: {
      service_id: provisioned.serviceId,
      deployment_id: provisioned.deploymentId,
      mesh_enabled: vars.NEURALCLAW_MESH_ENABLED,
      mesh_peers_present: Boolean(vars.NEURALCLAW_MESH_PEERS_JSON)
    }
  });

  return {
    deploymentId: deployment.id,
    serviceId: provisioned.serviceId,
    railwayDeploymentId: provisioned.deploymentId
  };
}

export async function runProvision(limit = 1) {
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const supabase = getSupabaseAdmin();

  const { data: pending, error: pendingErr } = await supabase
    .from("agents")
    .select("id, user_id, agent_name, provider, provider_api_key_encrypted, model, plan")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (pendingErr) {
    throw new Error(pendingErr.message);
  }

  if (!pending || pending.length === 0) {
    return { ok: true, processed: 0, results: [] as Array<Record<string, unknown>> };
  }

  const results = [] as Array<Record<string, unknown>>;

  for (const d of pending as DeploymentRow[]) {
    try {
      const r = await processOne(d);
      results.push({ ok: true, ...r });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("agents")
        .update({
          status: "failed",
          error_message: message,
          provision_attempts: 1
        })
        .eq("id", d.id);

      results.push({ ok: false, deploymentId: d.id, error: message });
    }
  }

  return { ok: true, processed: results.length, results };
}

export async function syncMeshEnvForUser(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, railway_service_id, status")
    .eq("user_id", userId)
    .not("railway_service_id", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  if (!agents || agents.length === 0) {
    return { processed: 0, redeployed: 0, failed: 0, results: [] as Array<Record<string, unknown>> };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const agent of agents) {
    if (!agent.railway_service_id) continue;
    try {
      const meshVars = await buildMeshEnvForAgent(userId, agent.id);
      const deploy = await updateRailwayService({
        serviceId: agent.railway_service_id,
        variables: meshVars
      });

      await supabase.from("agent_events").insert({
        agent_id: agent.id,
        event_type: "mesh_env_synced",
        level: "info",
        message: "Mesh environment synced and redeploy triggered",
        metadata: {
          deployment_id: deploy.deploymentId,
          mesh_enabled: meshVars.NEURALCLAW_MESH_ENABLED,
          mesh_peers_present: Boolean(meshVars.NEURALCLAW_MESH_PEERS_JSON)
        }
      });

      results.push({
        ok: true,
        agentId: agent.id,
        serviceId: agent.railway_service_id,
        deploymentId: deploy.deploymentId
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from("agent_events").insert({
        agent_id: agent.id,
        event_type: "mesh_env_sync_failed",
        level: "error",
        message,
        metadata: {}
      });
      results.push({
        ok: false,
        agentId: agent.id,
        serviceId: agent.railway_service_id,
        error: message
      });
    }
  }

  return {
    processed: results.length,
    redeployed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results
  };
}
