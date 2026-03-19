import { decryptToken } from "@/lib/token-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateServiceDomain, provisionOnRailway, resolveServiceEndpoint, updateRailwayService } from "@/lib/railway-api";
import { buildPeopleMemoryContent, type AgentPersonMemory } from "@/lib/people-memory";

type DeploymentRow = {
  id: string;
  user_id: string;
  agent_name: string;
  provider:
    | "openai"
    | "anthropic"
    | "openrouter"
    | "venice"
    | "local"
    | "g4f"
    | "chatgpt_token"
    | "claude_token"
    | "chatgpt_session"
    | "claude_session";
  provider_api_key_encrypted: string | null;
  model: string;
  plan: "monthly" | "yearly";
  persona: string | null;
  railway_service_id: string | null;
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

const CHANNEL_ENV_KEYS = [
  "NEURALCLAW_TELEGRAM_TOKEN",
  "NEURALCLAW_DISCORD_TOKEN",
  "NEURALCLAW_SLACK_BOT_API_KEY",
  "NEURALCLAW_SLACK_APP_API_KEY",
  "NEURALCLAW_WHATSAPP_API_KEY",
  "NEURALCLAW_SIGNAL_API_KEY",
] as const;

function sanitizeServiceName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function providerKeyEnvName(provider: DeploymentRow["provider"]): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  if (provider === "venice") return "OPENAI_API_KEY";
  if (provider === "chatgpt_token" || provider === "chatgpt_session") return "CHATGPT_TOKEN";
  if (provider === "claude_token" || provider === "claude_session") return "CLAUDE_SESSION_KEY";
  return null;
}

function normalizeRuntimeProvider(provider: DeploymentRow["provider"]): DeploymentRow["provider"] {
  if (provider === "venice") return "openai";
  if (provider === "chatgpt_session") return "chatgpt_token";
  if (provider === "claude_session") return "claude_token";
  return provider;
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

function emptyChannelEnv(): Record<string, string> {
  return CHANNEL_ENV_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});
}

async function buildRuntimeVarsForAgent(agentId: string): Promise<{
  vars: Record<string, string>;
  serviceId: string;
}> {
  const supabase = getSupabaseAdmin();

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id, user_id, agent_name, provider, provider_api_key_encrypted, model, plan, railway_service_id, persona")
    .eq("id", agentId)
    .single();

  if (agentErr || !agent) {
    throw new Error(agentErr?.message || "Unable to load agent");
  }
  if (!agent.railway_service_id) {
    throw new Error("Agent has no Railway service yet");
  }

  const { data: userRow, error: userErr } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", agent.user_id)
    .single();

  if (userErr || !userRow) {
    throw new Error(userErr?.message || "Unable to load user for agent");
  }

  const { data: channels, error: channelErr } = await supabase
    .from("agent_channels")
    .select("channel, token_encrypted")
    .eq("agent_id", agent.id);

  if (channelErr || !channels) {
    throw new Error(channelErr?.message || "Unable to load deployment channels");
  }

  const runtimeProvider = normalizeRuntimeProvider(agent.provider);

  const vars: Record<string, string> = {
    NEURALCLAW_AGENT_ID: agent.id,
    NEURALCLAW_PROVIDER: runtimeProvider,
    NEURALCLAW_MODEL: agent.model,
    NEURALCLAW_PLAN: agent.plan,
    NEURALCLAW_USER_EMAIL: userRow.email,
    NEURALCLAW_AGENT_NAME: agent.agent_name,
    ...(agent.persona ? { NEURALCLAW_PERSONA: agent.persona } : {}),
    ...emptyChannelEnv(),
    ...channelEnv(channels as ChannelRow[]),
  };
  if (agent.provider === "venice") {
    vars.NEURALCLAW_OPENAI_BASE_URL = "https://api.venice.ai/api/v1";
  }

  const sharedMeshSecret = process.env.NEURALCLAW_MESH_SHARED_SECRET;
  if (sharedMeshSecret) {
    vars.NEURALCLAW_MESH_SHARED_SECRET = sharedMeshSecret;
  }

  const meshVars = await buildMeshEnvForAgent(agent.user_id, agent.id);
  Object.assign(vars, meshVars);

  const providerEnv = providerKeyEnvName(agent.provider as DeploymentRow["provider"]);
  if (providerEnv && agent.provider_api_key_encrypted) {
    vars[providerEnv] = decryptToken(agent.provider_api_key_encrypted);
  }

  return { vars, serviceId: agent.railway_service_id };
}

async function buildMeshEnvForAgent(userId: string, sourceAgentId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();

  const [userResult, agentResult, knowledgeResult, peopleResult] = await Promise.all([
    supabase.from("app_users").select("mesh_enabled").eq("id", userId).single(),
    supabase.from("agents").select("custom_env").eq("id", sourceAgentId).eq("user_id", userId).single(),
    supabase.from("agent_knowledge").select("title, content").eq("agent_id", sourceAgentId).order("created_at", { ascending: true }),
    supabase
      .from("agent_people")
      .select("id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at")
      .eq("agent_id", sourceAgentId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);

  if (userResult.error || !userResult.data) {
    throw new Error(userResult.error?.message || "Unable to load user mesh settings");
  }
  if (peopleResult.error) {
    throw new Error(peopleResult.error.message || "Unable to load people memory");
  }

  const userRow = userResult.data;
  const customEnv = (agentResult.data?.custom_env as Record<string, string> | null) ?? {};

  // Build knowledge content if docs exist
  const knowledgeDocs = knowledgeResult.data ?? [];
  const knowledgeContent = knowledgeDocs.length > 0
    ? knowledgeDocs.map((d: { title: string; content: string }) => `=== ${d.title} ===\n${d.content}`).join("\n\n")
    : "";
  const peopleMemoryContent = buildPeopleMemoryContent(
    ((peopleResult.data ?? []) as AgentPersonMemory[]).map((person) => ({
      ...person,
      aliases: Array.isArray(person.aliases) ? person.aliases : [],
      channel_identities:
        person.channel_identities && typeof person.channel_identities === "object"
          ? (person.channel_identities as Record<string, string>)
          : {},
    }))
  );
  const combinedKnowledgeContent = [knowledgeContent, peopleMemoryContent]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
  const companionRelayUrl =
    process.env.COMPANION_RELAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_COMPANION_RELAY_HTTP_URL ||
    "";
  const companionRelaySecret = process.env.COMPANION_RELAY_SHARED_SECRET || "";
  const companionTaskTimeout = process.env.COMPANION_RELAY_TASK_TIMEOUT || "45";
  const controlBaseUrl = (process.env.DEPLOYMENT_BASE_URL || "").trim().replace(/\/+$/, "");
  const provisionerSecret = (process.env.PROVISIONER_SECRET || "").trim();

  const vars: Record<string, string> = {
    NEURALCLAW_MESH_ENABLED: userRow.mesh_enabled ? "true" : "false",
    NEURALCLAW_MESH_PEERS_JSON: "",
    NEURALCLAW_KNOWLEDGE_CONTENT: combinedKnowledgeContent,
    NEURALCLAW_COMPANION_RELAY_URL: companionRelayUrl.replace(/\/+$/, ""),
    NEURALCLAW_COMPANION_RELAY_SHARED_SECRET: companionRelaySecret,
    NEURALCLAW_COMPANION_TASK_TIMEOUT: companionTaskTimeout,
    NEURALCLAW_CONTROL_BASE_URL: controlBaseUrl,
    NEURALCLAW_PROVISIONER_SECRET: provisionerSecret,
    // Spread custom env vars (user-defined API keys, etc.)
    ...customEnv,
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
    .select("id, agent_name, status, railway_service_id, railway_domain")
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
        railwayServiceId: target.railway_service_id,
        endpoint: (target as MeshPeerAgentRow & { railway_domain?: string | null }).railway_domain ?? undefined
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
        endpoint: string | undefined;
      } => Boolean(peer)
    );

  // For peers that don't have a stored domain yet, fall back to querying Railway live.
  if (peers.length > 0) {
    for (const peer of peers) {
      if (!peer.endpoint && peer.railwayServiceId) {
        const resolved = await resolveServiceEndpoint(peer.railwayServiceId);
        if (resolved) {
          peer.endpoint = resolved;
        }
      }
    }
  }

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

  const runtimeProvider = normalizeRuntimeProvider(deployment.provider);

  const vars: Record<string, string> = {
    NEURALCLAW_AGENT_ID: deployment.id,
    NEURALCLAW_PROVIDER: runtimeProvider,
    NEURALCLAW_MODEL: deployment.model,
    NEURALCLAW_PLAN: deployment.plan,
    NEURALCLAW_USER_EMAIL: userRow.email,
    NEURALCLAW_AGENT_NAME: deployment.agent_name,
    ...channelEnv(channels as ChannelRow[])
  };
  if (deployment.provider === "venice") {
    vars.NEURALCLAW_OPENAI_BASE_URL = "https://api.venice.ai/api/v1";
  }

  if (deployment.persona) {
    vars.NEURALCLAW_PERSONA = deployment.persona;
  }

  const sharedMeshSecret = process.env.NEURALCLAW_MESH_SHARED_SECRET;
  if (sharedMeshSecret) {
    vars.NEURALCLAW_MESH_SHARED_SECRET = sharedMeshSecret;
  }

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
      railway_domain: provisioned.domain ?? null,
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
    .select("id, user_id, agent_name, provider, provider_api_key_encrypted, model, plan, persona, railway_service_id")
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

export async function backfillDomains(userId?: string) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("agents")
    .select("id, user_id, railway_service_id")
    .eq("status", "active")
    .not("railway_service_id", "is", null)
    .is("railway_domain", null);

  if (userId) {
    query = query.eq("user_id", userId) as typeof query;
  }

  const { data: agents, error } = await query;

  if (error) throw new Error(error.message);
  if (!agents || agents.length === 0) {
    return { processed: 0, updated: 0, failed: 0, results: [] as Array<Record<string, unknown>> };
  }

  const results: Array<Record<string, unknown>> = [];
  const affectedUserIds = new Set<string>();

  for (const agent of agents as Array<{ id: string; user_id: string; railway_service_id: string }>) {
    try {
      const domain = await generateServiceDomain(agent.railway_service_id);
      if (!domain) {
        results.push({ ok: false, agentId: agent.id, error: "Railway returned no domain" });
        continue;
      }

      await supabase
        .from("agents")
        .update({ railway_domain: domain })
        .eq("id", agent.id);

      affectedUserIds.add(agent.user_id);
      results.push({ ok: true, agentId: agent.id, domain });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, agentId: agent.id, error: message });
    }
  }

  // Re-sync mesh env for every affected user so peer JSON gets the new endpoints.
  const syncResults: Array<Record<string, unknown>> = [];
  for (const uid of affectedUserIds) {
    try {
      const s = await syncMeshEnvForUser(uid);
      syncResults.push({ ok: true, userId: uid, ...s });
    } catch (err) {
      syncResults.push({ ok: false, userId: uid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    processed: agents.length,
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    meshSync: syncResults
  };
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
      const { vars } = await buildRuntimeVarsForAgent(agent.id);
      const deploy = await updateRailwayService({
        serviceId: agent.railway_service_id,
        variables: vars
      });

      await supabase.from("agent_events").insert({
        agent_id: agent.id,
        event_type: "mesh_env_synced",
        level: "info",
        message: "Runtime environment synced and redeploy triggered",
        metadata: {
          deployment_id: deploy.deploymentId,
          mesh_enabled: vars.NEURALCLAW_MESH_ENABLED,
          mesh_peers_present: Boolean(vars.NEURALCLAW_MESH_PEERS_JSON),
          agent_id_present: Boolean(vars.NEURALCLAW_AGENT_ID),
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

export async function syncAgentRuntimeEnv(agentId: string) {
  const supabase = getSupabaseAdmin();
  const { vars, serviceId } = await buildRuntimeVarsForAgent(agentId);

  const deploy = await updateRailwayService({
    serviceId,
    variables: vars,
  });

  await supabase.from("agent_events").insert({
    agent_id: agentId,
    event_type: "runtime_env_synced",
    level: "info",
    message: "Runtime env synced and redeploy triggered",
    metadata: {
      deployment_id: deploy.deploymentId,
    },
  });

  return {
    ok: true,
    agentId,
    serviceId,
    deploymentId: deploy.deploymentId,
  };
}
