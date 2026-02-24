"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearStoredUser, getStoredUser } from "@/lib/session-client";

type Agent = {
  id: string;
  agent_name: string;
  plan: "monthly" | "yearly";
  provider: string;
  model: string;
  status: "pending" | "provisioning" | "active" | "failed" | "paused";
  railway_service_id: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

type MeshLink = {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  permission: "delegate" | "read_only" | "blocked";
  enabled: boolean;
};

const HEALTH_LABEL: Record<Agent["status"], string> = {
  pending: "Queued",
  provisioning: "Deploying",
  active: "Healthy",
  failed: "Failed",
  paused: "Paused"
};

export default function DashboardPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [meshEnabled, setMesh] = useState(false);
  const [name, setName] = useState("Operator");
  const [links, setLinks] = useState<MeshLink[]>([]);
  const [meshError, setMeshError] = useState("");
  const [sourceAgentId, setSourceAgentId] = useState("");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [permission, setPermission] = useState<"delegate" | "read_only" | "blocked">("delegate");

  const refresh = useCallback(async () => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setName(user.name);

    const res = await fetch(`/api/dashboard?email=${encodeURIComponent(user.email)}`);
    const data = await res.json();
    const list = (data.agents ?? []) as Agent[];
    setAgents(list);
    if (list.length > 0) {
      setSourceAgentId((prev) => prev || list[0].id);
      setTargetAgentId((prev) => prev || (list[1]?.id ?? list[0].id));
    }

    const meshConfigRes = await fetch(`/api/mesh/config?email=${encodeURIComponent(user.email)}`);
    const meshConfig = await meshConfigRes.json();
    if (meshConfigRes.ok) {
      setMesh(Boolean(meshConfig.meshEnabled));
    }

    const meshLinksRes = await fetch(`/api/mesh/links?email=${encodeURIComponent(user.email)}`);
    const meshLinks = await meshLinksRes.json();
    if (meshLinksRes.ok) {
      setLinks((meshLinks.links ?? []) as MeshLink[]);
    }

    setLoading(false);

    if (list.length === 0) {
      router.replace("/onboard");
    }
  }, [router]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  async function toggleMeshEnabled() {
    const user = getStoredUser();
    if (!user) return;
    const next = !meshEnabled;
    setMesh(next);
    const res = await fetch("/api/mesh/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, meshEnabled: next })
    });
    if (!res.ok) {
      setMesh(!next);
      const data = await res.json().catch(() => ({}));
      setMeshError(data.error || "Unable to update mesh setting.");
    } else {
      setMeshError("");
    }
  }

  async function createLink() {
    const user = getStoredUser();
    if (!user) return;
    if (!sourceAgentId || !targetAgentId || sourceAgentId === targetAgentId) {
      setMeshError("Choose different source and target agents.");
      return;
    }
    const res = await fetch("/api/mesh/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        sourceAgentId,
        targetAgentId,
        permission,
        enabled: true
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMeshError(data.error || "Unable to create mesh link.");
      return;
    }
    setMeshError("");
    await refresh();
  }

  async function removeLink(linkId: string) {
    const user = getStoredUser();
    if (!user) return;
    const res = await fetch("/api/mesh/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, linkId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMeshError(data.error || "Unable to remove mesh link.");
      return;
    }
    setMeshError("");
    await refresh();
  }

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.agent_name);
    return map;
  }, [agents]);

  const stats = useMemo(() => {
    return {
      total: agents.length,
      active: agents.filter((a) => a.status === "active").length,
      building: agents.filter((a) => a.status === "pending" || a.status === "provisioning").length,
      failed: agents.filter((a) => a.status === "failed").length
    };
  }, [agents]);

  if (loading) {
    return <main className="dashboard-wrap"><div className="card">Loading dashboard...</div></main>;
  }

  return (
    <main className="dashboard-wrap">
      <div className="bg-orb orb-a" />
      <header className="dash-head">
        <div>
          <p className="eyebrow">Control Center</p>
          <h1>Welcome, {name}</h1>
        </div>
        <div className="top-actions">
          <Link href="/onboard" className="solid-btn">Create Agent</Link>
          <button
            className="ghost-btn"
            onClick={() => {
              clearStoredUser();
              router.push("/login");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <section className="kpi-row">
        <div className="kpi"><span>Total Agents</span><strong>{stats.total}</strong></div>
        <div className="kpi"><span>Healthy</span><strong>{stats.active}</strong></div>
        <div className="kpi"><span>Deploying</span><strong>{stats.building}</strong></div>
        <div className="kpi"><span>Failed</span><strong>{stats.failed}</strong></div>
      </section>

      <section className="mesh-card">
        <div>
          <h3>Mesh Communication</h3>
          <p>Allow your agents to delegate tasks to each other through shared mesh routing.</p>
        </div>
        <button
          className={`switch big ${meshEnabled ? "on" : ""}`}
          onClick={toggleMeshEnabled}
        />
      </section>
      {meshError && <div className="status err">{meshError}</div>}

      <section className="card mesh-manage">
        <h3>Mesh Links</h3>
        <p className="muted">Define which agent can delegate tasks to another agent.</p>
        <div className="mesh-row">
          <select className="select" value={sourceAgentId} onChange={(e) => setSourceAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.agent_name} (source)</option>
            ))}
          </select>
          <select className="select" value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.agent_name} (target)</option>
            ))}
          </select>
          <select className="select" value={permission} onChange={(e) => setPermission(e.target.value as "delegate" | "read_only" | "blocked")}>
            <option value="delegate">delegate</option>
            <option value="read_only">read_only</option>
            <option value="blocked">blocked</option>
          </select>
          <button className="solid-btn" onClick={createLink}>Add Link</button>
        </div>
        <div className="link-list">
          {links.length === 0 && <p className="muted">No mesh links yet.</p>}
          {links.map((link) => (
            <div className="link-item" key={link.id}>
              <span>
                {agentNameById.get(link.source_agent_id) || link.source_agent_id} {"->"} {agentNameById.get(link.target_agent_id) || link.target_agent_id}
                {" "}({link.permission})
              </span>
              <button className="ghost-btn" onClick={() => removeLink(link.id)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <section className="agents-board">
        {agents.map((agent) => (
          <article className="agent-card" key={agent.id}>
            <div className="agent-top">
              <h4>{agent.agent_name}</h4>
              <span className={`pill ${agent.status}`}>{HEALTH_LABEL[agent.status]}</span>
            </div>
            <p className="muted">{agent.provider} · {agent.model} · {agent.plan}</p>
            <p className="muted">Service: {agent.railway_service_id || "not created yet"}</p>
            {agent.error_message && <p className="status err">{agent.error_message}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
