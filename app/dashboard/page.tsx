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
  railway_domain: string | null;
  deployed_at: string | null;
  provision_attempts: number;
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

type HealthData = {
  online: boolean;
  reason?: string;
  eventCount: number;
  mesh_enabled?: boolean;
  peers?: number;
};

const STATUS_LABEL: Record<Agent["status"], string> = {
  pending: "Queued",
  provisioning: "Deploying",
  active: "Healthy",
  failed: "Failed",
  paused: "Paused",
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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
  const [health, setHealth] = useState<Record<string, HealthData>>({});
  const [actionPending, setActionPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const user = getStoredUser();
    if (!user) { router.replace("/login"); return; }
    setName(user.name);

    const [dashRes, meshConfigRes, meshLinksRes] = await Promise.all([
      fetch(`/api/dashboard?email=${encodeURIComponent(user.email)}`),
      fetch(`/api/mesh/config?email=${encodeURIComponent(user.email)}`),
      fetch(`/api/mesh/links?email=${encodeURIComponent(user.email)}`),
    ]);

    const dashData = await dashRes.json();
    const list = (dashData.agents ?? []) as Agent[];
    setAgents(list);
    if (list.length > 0) {
      setSourceAgentId((p) => p || list[0].id);
      setTargetAgentId((p) => p || (list[1]?.id ?? list[0].id));
    }

    if (meshConfigRes.ok) {
      const mc = await meshConfigRes.json();
      setMesh(Boolean(mc.meshEnabled));
    }
    if (meshLinksRes.ok) {
      const ml = await meshLinksRes.json();
      setLinks((ml.links ?? []) as MeshLink[]);
    }

    setLoading(false);
    if (list.length === 0) { router.replace("/onboard"); return; }

    // Fetch health for all agents in parallel (non-blocking)
    const healthResults = await Promise.all(
      list.map((a) =>
        fetch(`/api/agents/${a.id}/health?email=${encodeURIComponent(user.email)}`)
          .then((r) => r.json() as Promise<HealthData>)
          .then((d) => [a.id, d] as [string, HealthData])
          .catch(() => [a.id, { online: false, reason: "fetch_error", eventCount: 0 }] as [string, HealthData])
      )
    );
    setHealth(Object.fromEntries(healthResults));
  }, [router]);

  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);

  async function agentAction(
    agentId: string,
    action: "pause" | "resume" | "delete",
    confirmMsg: string
  ) {
    if (!confirm(confirmMsg)) return;
    const user = getStoredUser();
    if (!user) return;
    setActionPending(agentId);
    try {
      if (action === "delete") {
        await fetch(`/api/agents/${agentId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });
      } else {
        await fetch(`/api/agents/${agentId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });
      }
      await refresh();
    } finally {
      setActionPending(null);
    }
  }

  async function toggleMeshEnabled() {
    const user = getStoredUser();
    if (!user) return;
    const next = !meshEnabled;
    setMesh(next);
    const res = await fetch("/api/mesh/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, meshEnabled: next }),
    });
    if (!res.ok) {
      setMesh(!next);
      const d = await res.json().catch(() => ({}));
      setMeshError(d.error || "Unable to update mesh setting.");
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
      body: JSON.stringify({ email: user.email, sourceAgentId, targetAgentId, permission, enabled: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMeshError(data.error || "Unable to create mesh link."); return; }
    setMeshError("");
    await refresh();
  }

  async function removeLink(linkId: string) {
    const user = getStoredUser();
    if (!user) return;
    const res = await fetch("/api/mesh/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, linkId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMeshError(data.error || "Unable to remove mesh link."); return; }
    setMeshError("");
    await refresh();
  }

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.agent_name);
    return m;
  }, [agents]);

  const stats = useMemo(() => ({
    total: agents.length,
    active: agents.filter((a) => a.status === "active").length,
    building: agents.filter((a) => a.status === "pending" || a.status === "provisioning").length,
    failed: agents.filter((a) => a.status === "failed").length,
    online: Object.values(health).filter((h) => h.online).length,
    totalEvents: Object.values(health).reduce((s, h) => s + (h.eventCount ?? 0), 0),
  }), [agents, health]);

  if (loading) {
    return (
      <main className="dashboard-wrap">
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>◈</span>
          Loading dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-wrap">
      <div className="bg-orb orb-a" />

      <header className="dash-head">
        <div>
          <p className="eyebrow">Control Center</p>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>Welcome, {name}</h1>
        </div>
        <div className="top-actions">
          <Link href="/onboard" className="solid-btn">+ New Agent</Link>
          <button className="ghost-btn" onClick={() => { clearStoredUser(); router.push("/login"); }}>
            Logout
          </button>
        </div>
      </header>

      {/* ── KPI row ── */}
      <section className="kpi-row">
        <div className="kpi"><span>Total Agents</span><strong>{stats.total}</strong></div>
        <div className="kpi"><span>Healthy</span><strong style={{ color: "var(--ok)" }}>{stats.active}</strong></div>
        <div className="kpi"><span>Deploying</span><strong style={{ color: "var(--amber)" }}>{stats.building}</strong></div>
        <div className="kpi"><span>Failed</span><strong style={{ color: "var(--danger)" }}>{stats.failed}</strong></div>
        <div className="kpi">
          <span>Online Now</span>
          <strong style={{ color: stats.online > 0 ? "var(--ok)" : "var(--muted)" }}>
            {Object.keys(health).length === 0 ? "—" : `${stats.online}/${stats.total}`}
          </strong>
        </div>
        <div className="kpi">
          <span>Total Events</span>
          <strong>{stats.totalEvents}</strong>
        </div>
      </section>

      {/* ── Mesh toggle ── */}
      <section className="mesh-card">
        <div>
          <h3>Mesh Communication</h3>
          <p>Allow your agents to delegate tasks to each other through shared mesh routing.</p>
        </div>
        <button className={`switch big ${meshEnabled ? "on" : ""}`} onClick={toggleMeshEnabled} />
      </section>
      {meshError && <div className="status err">{meshError}</div>}

      {/* ── Mesh links ── */}
      <section className="card mesh-manage">
        <h3>Mesh Links</h3>
        <p className="muted">Define which agent can delegate tasks to another agent.</p>
        <div className="mesh-row">
          <select className="select" value={sourceAgentId} onChange={(e) => setSourceAgentId(e.target.value)}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name} (source)</option>)}
          </select>
          <select className="select" value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name} (target)</option>)}
          </select>
          <select className="select" value={permission} onChange={(e) => setPermission(e.target.value as typeof permission)}>
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
                {agentNameById.get(link.source_agent_id) || link.source_agent_id}
                {" → "}
                {agentNameById.get(link.target_agent_id) || link.target_agent_id}
                {" "}
                <span className={`pill ${link.permission === "blocked" ? "failed" : "active"}`}>
                  {link.permission}
                </span>
              </span>
              <button className="ghost-btn" onClick={() => removeLink(link.id)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Agent cards ── */}
      <section className="agents-board">
        {agents.map((agent) => {
          const h = health[agent.id];
          const isPending = actionPending === agent.id;

          return (
            <article className="agent-card" key={agent.id}>
              {/* Header row */}
              <div className="agent-top">
                <h4>{agent.agent_name}</h4>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {h && (
                    <span
                      className="pill"
                      style={{
                        borderColor: h.online ? "rgba(34,211,165,0.4)" : "rgba(255,77,109,0.3)",
                        color: h.online ? "var(--ok)" : "var(--muted)",
                        fontSize: "0.65rem",
                      }}
                    >
                      {h.online ? "● ONLINE" : "○ OFFLINE"}
                    </span>
                  )}
                  <span className={`pill ${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
                </div>
              </div>

              {/* Details */}
              <p className="muted" style={{ margin: "8px 0 4px", fontSize: "0.85rem" }}>
                {agent.provider} · {agent.model} · {agent.plan}
              </p>

              {agent.deployed_at && (
                <p className="muted" style={{ margin: "2px 0 4px", fontSize: "0.8rem" }}>
                  Deployed {ago(agent.deployed_at)}
                  {agent.provision_attempts > 1 && ` · ${agent.provision_attempts} attempts`}
                </p>
              )}

              {/* Railway domain link */}
              {agent.railway_domain && (
                <p style={{ margin: "4px 0 8px", fontSize: "0.8rem" }}>
                  <a
                    href={agent.railway_domain}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--amber)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    ↗ {agent.railway_domain.replace("https://", "")}
                  </a>
                </p>
              )}

              {/* Health stats */}
              {h && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    margin: "8px 0",
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--muted)",
                  }}
                >
                  <span title="Events logged">{h.eventCount} events</span>
                  {h.online && h.peers !== undefined && (
                    <span title="Mesh peers connected">{h.peers} peers</span>
                  )}
                  {h.online && h.mesh_enabled !== undefined && (
                    <span style={{ color: h.mesh_enabled ? "var(--ok)" : "var(--muted)" }}>
                      mesh {h.mesh_enabled ? "on" : "off"}
                    </span>
                  )}
                </div>
              )}

              {agent.error_message && (
                <p className="status err" style={{ fontSize: "0.82rem", margin: "6px 0" }}>
                  {agent.error_message}
                </p>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {agent.status === "active" && (
                  <button
                    className="ghost-btn"
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                    disabled={isPending}
                    onClick={() =>
                      agentAction(agent.id, "pause", `Pause "${agent.agent_name}"? The Railway service will keep running but marked as paused.`)
                    }
                  >
                    ⏸ Pause
                  </button>
                )}
                {agent.status === "paused" && (
                  <button
                    className="solid-btn"
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                    disabled={isPending}
                    onClick={() =>
                      agentAction(agent.id, "resume", `Resume "${agent.agent_name}"? This will trigger a Railway redeploy.`)
                    }
                  >
                    ▶ Resume
                  </button>
                )}
                <button
                  className="ghost-btn"
                  style={{ fontSize: "0.8rem", padding: "6px 12px", borderColor: "rgba(255,77,109,0.3)", color: "var(--danger)", marginLeft: "auto" }}
                  disabled={isPending}
                  onClick={() =>
                    agentAction(agent.id, "delete", `Delete "${agent.agent_name}" permanently? This removes the Railway service and all data. This cannot be undone.`)
                  }
                >
                  {isPending ? "…" : "🗑 Delete"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
