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

type KnowledgeDoc = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

type ChannelKey = "telegram" | "discord" | "slack" | "whatsapp" | "signal";

type AgentChannelState = {
  channel: ChannelKey;
  enabled: boolean;
  hasToken: boolean;
};

type TraceEntry = { category: string; message: string; timestamp: number };
type MonitorData = { stats: Record<string, unknown>; traces: TraceEntry[] };

const CHANNEL_OPTIONS: Array<{ key: ChannelKey; label: string; placeholder: string }> = [
  { key: "telegram", label: "Telegram", placeholder: "123456:ABC..." },
  { key: "discord", label: "Discord", placeholder: "Discord bot token" },
  { key: "slack", label: "Slack", placeholder: "xoxb-...|xapp-..." },
  { key: "whatsapp", label: "WhatsApp", placeholder: "Session id" },
  { key: "signal", label: "Signal", placeholder: "+1234567890" },
];

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

// ---------------------------------------------------------------------------
// MonitorPanel — stats grid + trace list with auto-refresh
// ---------------------------------------------------------------------------

function MonitorPanel({
  agentId,
  data,
  loading,
  onRefresh,
}: {
  agentId: string;
  data: MonitorData;
  loading: boolean;
  onRefresh: () => void;
}) {
  useEffect(() => {
    const id = setInterval(onRefresh, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const s = data.stats as Record<string, unknown>;
  const successRate = typeof s.success_rate === "number" ? s.success_rate : null;
  const rateClass =
    successRate === null ? "" : successRate > 0.8 ? "good" : successRate > 0.5 ? "warn" : "bad";
  const rateLabel = successRate !== null ? `${(successRate * 100).toFixed(0)}%` : "—";

  const CATEGORY_COLOR: Record<string, string> = {
    perception: "var(--accent, #58a6ff)",
    memory: "#bc8cff",
    reasoning: "var(--ok, #3fb950)",
    action: "var(--amber, #d29922)",
    swarm: "var(--danger, #f85149)",
  };

  return (
    <div className="agent-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p className="panel-label" style={{ margin: 0 }}>Live Monitor</p>
        {loading && <span className="muted" style={{ fontSize: "0.75rem" }}>Refreshing…</span>}
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "6px 12px",
          marginBottom: 14,
          fontSize: "0.8rem",
        }}
      >
        {[
          { label: "Provider", value: String(s.provider ?? "—") },
          { label: "Interactions", value: String(s.interactions ?? "—") },
          { label: "Success Rate", value: rateLabel, cls: rateClass },
          { label: "Skills", value: String(s.skills ?? "—") },
          { label: "Channels", value: String(s.channels ?? "—") },
          { label: "Uptime", value: String(s.uptime ?? "—") },
        ].map(({ label, value, cls }) => (
          <div key={label} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 4 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.7rem" }}>{label}</p>
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                color: cls === "good"
                  ? "var(--ok, #3fb950)"
                  : cls === "warn"
                  ? "var(--amber, #d29922)"
                  : cls === "bad"
                  ? "var(--danger, #f85149)"
                  : undefined,
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Traces */}
      <p className="panel-label" style={{ margin: "0 0 8px", fontSize: "0.75rem" }}>
        Recent Traces
      </p>
      {data.traces.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.78rem" }}>No traces yet.</p>
      ) : (
        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {data.traces.map((t, i) => {
            const cat = (t.category || "action").toLowerCase();
            const color = CATEGORY_COLOR[cat] ?? "var(--muted)";
            return (
              <div
                key={i}
                style={{
                  borderLeft: `3px solid ${color}`,
                  paddingLeft: 8,
                  paddingTop: 4,
                  paddingBottom: 4,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "0 4px 4px 0",
                  fontSize: "0.78rem",
                }}
              >
                <span style={{ color: "var(--muted)", fontSize: "0.7rem", marginRight: 6 }}>
                  {new Date(t.timestamp * 1000).toLocaleTimeString()}
                </span>
                <span style={{ color, fontWeight: 600, marginRight: 6 }}>
                  [{t.category?.toUpperCase() ?? ""}]
                </span>
                <span>{t.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

  // Per-agent panels
  const [envExpanded, setEnvExpanded] = useState<Set<string>>(new Set());
  const [kbExpanded, setKbExpanded] = useState<Set<string>>(new Set());
  const [channelsExpanded, setChannelsExpanded] = useState<Set<string>>(new Set());
  const [monitorExpanded, setMonitorExpanded] = useState<Set<string>>(new Set());
  const [monitorData, setMonitorData] = useState<Record<string, MonitorData>>({});
  const [monitorLoading, setMonitorLoading] = useState<Set<string>>(new Set());
  const [envVars, setEnvVars] = useState<Record<string, Record<string, string>>>({});
  const [knowledgeDocs, setKnowledgeDocs] = useState<Record<string, KnowledgeDoc[]>>({});
  const [agentChannels, setAgentChannels] = useState<Record<string, AgentChannelState[]>>({});
  const [envLoading, setEnvLoading] = useState<Set<string>>(new Set());
  const [kbLoading, setKbLoading] = useState<Set<string>>(new Set());
  const [channelsLoading, setChannelsLoading] = useState<Set<string>>(new Set());
  // New env var form state per agent
  const [newEnvKey, setNewEnvKey] = useState<Record<string, string>>({});
  const [newEnvVal, setNewEnvVal] = useState<Record<string, string>>({});
  const [envMasked, setEnvMasked] = useState<Record<string, Set<string>>>({});
  // New knowledge form state per agent
  const [newKbTitle, setNewKbTitle] = useState<Record<string, string>>({});
  const [newKbContent, setNewKbContent] = useState<Record<string, string>>({});
  const [channelTokens, setChannelTokens] = useState<Record<string, Record<ChannelKey, string>>>({});
  const [panelError, setPanelError] = useState<Record<string, string>>({});

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

  // ── Env vars ──────────────────────────────────────────────
  async function loadEnv(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    setEnvLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/env?email=${encodeURIComponent(user.email)}`);
    if (res.ok) {
      const data = await res.json();
      setEnvVars((prev) => ({ ...prev, [agentId]: data.vars ?? {} }));
    }
    setEnvLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  async function saveEnvVar(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    const key = (newEnvKey[agentId] ?? "").trim();
    const value = newEnvVal[agentId] ?? "";
    if (!key) { setPanelError((p) => ({ ...p, [agentId + "_env"]: "Key cannot be empty." })); return; }
    setPanelError((p) => ({ ...p, [agentId + "_env"]: "" }));
    setEnvLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/env`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, key, value }),
    });
    const data = await res.json();
    if (res.ok) {
      setEnvVars((prev) => ({ ...prev, [agentId]: data.vars }));
      setNewEnvKey((p) => ({ ...p, [agentId]: "" }));
      setNewEnvVal((p) => ({ ...p, [agentId]: "" }));
    } else {
      setPanelError((p) => ({ ...p, [agentId + "_env"]: data.error ?? "Failed to save." }));
    }
    setEnvLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  async function deleteEnvVar(agentId: string, key: string) {
    const user = getStoredUser();
    if (!user) return;
    setEnvLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/env`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, key }),
    });
    const data = await res.json();
    if (res.ok) {
      setEnvVars((prev) => ({ ...prev, [agentId]: data.vars }));
    }
    setEnvLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  function toggleEnvPanel(agentId: string) {
    setEnvExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
        if (!envVars[agentId]) loadEnv(agentId);
      }
      return next;
    });
  }

  // Channels
  async function loadChannels(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    setChannelsLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/channels?email=${encodeURIComponent(user.email)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const rows = (data.channels ?? []) as AgentChannelState[];
      setAgentChannels((prev) => ({ ...prev, [agentId]: rows }));
      setChannelTokens((prev) => ({
        ...prev,
        [agentId]: CHANNEL_OPTIONS.reduce<Record<ChannelKey, string>>((acc, c) => {
          acc[c.key] = prev[agentId]?.[c.key] ?? "";
          return acc;
        }, {} as Record<ChannelKey, string>),
      }));
    } else {
      setPanelError((p) => ({ ...p, [agentId + "_channels"]: data.error ?? "Failed to load channels." }));
    }
    setChannelsLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  function setChannelEnabled(agentId: string, channel: ChannelKey, enabled: boolean) {
    setAgentChannels((prev) => ({
      ...prev,
      [agentId]: (prev[agentId] ?? []).map((row) =>
        row.channel === channel ? { ...row, enabled } : row
      ),
    }));
  }

  async function saveChannels(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    const rows = agentChannels[agentId] ?? [];
    const tokens = channelTokens[agentId] ?? ({} as Record<ChannelKey, string>);
    if (rows.length === 0) {
      setPanelError((p) => ({ ...p, [agentId + "_channels"]: "No channels loaded." }));
      return;
    }

    const payload = rows.map((row) => ({
      channel: row.channel,
      enabled: row.enabled,
      token: tokens[row.channel] ?? "",
    }));

    setPanelError((p) => ({ ...p, [agentId + "_channels"]: "" }));
    setChannelsLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/channels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, channels: payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAgentChannels((prev) => ({ ...prev, [agentId]: (data.channels ?? []) as AgentChannelState[] }));
      setChannelTokens((prev) => ({
        ...prev,
        [agentId]: CHANNEL_OPTIONS.reduce<Record<ChannelKey, string>>((acc, c) => {
          acc[c.key] = "";
          return acc;
        }, {} as Record<ChannelKey, string>),
      }));
    } else {
      setPanelError((p) => ({ ...p, [agentId + "_channels"]: data.error ?? "Failed to save channels." }));
    }
    setChannelsLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  function toggleChannelsPanel(agentId: string) {
    setChannelsExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
        if (!agentChannels[agentId]) loadChannels(agentId);
      }
      return next;
    });
  }

  // ── Knowledge base ────────────────────────────────────────
  async function loadKnowledge(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    setKbLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/knowledge?email=${encodeURIComponent(user.email)}`);
    if (res.ok) {
      const data = await res.json();
      setKnowledgeDocs((prev) => ({ ...prev, [agentId]: data.docs ?? [] }));
    }
    setKbLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  async function addKnowledgeDoc(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    const title = (newKbTitle[agentId] ?? "").trim();
    const content = (newKbContent[agentId] ?? "").trim();
    if (!title || !content) {
      setPanelError((p) => ({ ...p, [agentId + "_kb"]: "Title and content are required." }));
      return;
    }
    setPanelError((p) => ({ ...p, [agentId + "_kb"]: "" }));
    setKbLoading((s) => new Set(s).add(agentId));
    const res = await fetch(`/api/agents/${agentId}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, title, content }),
    });
    const data = await res.json();
    if (res.ok) {
      setKnowledgeDocs((prev) => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), data.doc] }));
      setNewKbTitle((p) => ({ ...p, [agentId]: "" }));
      setNewKbContent((p) => ({ ...p, [agentId]: "" }));
    } else {
      setPanelError((p) => ({ ...p, [agentId + "_kb"]: data.error ?? "Failed to save." }));
    }
    setKbLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  async function deleteKnowledgeDoc(agentId: string, docId: string) {
    const user = getStoredUser();
    if (!user) return;
    setKbLoading((s) => new Set(s).add(agentId));
    await fetch(`/api/agents/${agentId}/knowledge`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, docId }),
    });
    setKnowledgeDocs((prev) => ({
      ...prev,
      [agentId]: (prev[agentId] ?? []).filter((d) => d.id !== docId),
    }));
    setKbLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  async function uploadKbFile(agentId: string, file: File) {
    const user = getStoredUser();
    if (!user) return;
    setPanelError((p) => ({ ...p, [agentId + "_kb"]: "" }));
    setKbLoading((s) => new Set(s).add(agentId));
    const fd = new FormData();
    fd.append("email", user.email);
    fd.append("file", file);
    const res = await fetch(`/api/agents/${agentId}/knowledge/upload`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setKnowledgeDocs((prev) => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), data.doc] }));
    } else {
      setPanelError((p) => ({ ...p, [agentId + "_kb"]: data.error ?? "Upload failed." }));
    }
    setKbLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
  }

  function toggleKbPanel(agentId: string) {
    setKbExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
        if (!knowledgeDocs[agentId]) loadKnowledge(agentId);
      }
      return next;
    });
  }

  // ── Monitor ───────────────────────────────────────────────
  async function loadMonitor(agentId: string) {
    const user = getStoredUser();
    if (!user) return;
    setMonitorLoading((s) => new Set(s).add(agentId));
    try {
      const res = await fetch(`/api/agents/${agentId}/monitor?email=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const data = await res.json();
        setMonitorData((prev) => ({ ...prev, [agentId]: { stats: data.stats ?? {}, traces: data.traces ?? [] } }));
      }
    } finally {
      setMonitorLoading((s) => { const n = new Set(s); n.delete(agentId); return n; });
    }
  }

  function toggleMonitorPanel(agentId: string) {
    setMonitorExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
        loadMonitor(agentId);
      }
      return next;
    });
  }

  // ── Agent actions ─────────────────────────────────────────
  async function agentAction(agentId: string, action: "pause" | "resume" | "delete", confirmMsg: string) {
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
          const isEnvOpen = envExpanded.has(agent.id);
          const isKbOpen = kbExpanded.has(agent.id);
          const isChannelsOpen = channelsExpanded.has(agent.id);
          const isMonitorOpen = monitorExpanded.has(agent.id);
          const agentEnv = envVars[agent.id] ?? {};
          const agentDocs = knowledgeDocs[agent.id] ?? [];
          const agentChannelRows = agentChannels[agent.id] ?? [];
          const channelTokenDrafts = channelTokens[agent.id] ?? ({} as Record<ChannelKey, string>);
          const agentMonitor = monitorData[agent.id] ?? { stats: {}, traces: [] };
          const isEnvLoading = envLoading.has(agent.id);
          const isKbLoading = kbLoading.has(agent.id);
          const isChannelsLoading = channelsLoading.has(agent.id);
          const isMonitorLoading = monitorLoading.has(agent.id);

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
                {/* Panel toggles */}
                <button
                  className={`ghost-btn ${isEnvOpen ? "active" : ""}`}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  onClick={() => toggleEnvPanel(agent.id)}
                  title="Environment Variables"
                >
                  ⚙ Env Vars
                </button>
                <button
                  className={`ghost-btn ${isChannelsOpen ? "active" : ""}`}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  onClick={() => toggleChannelsPanel(agent.id)}
                  title="Channel Connections"
                >
                  Channels
                </button>
                <button
                  className={`ghost-btn ${isKbOpen ? "active" : ""}`}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  onClick={() => toggleKbPanel(agent.id)}
                  title="Knowledge Base"
                >
                  📚 Knowledge
                </button>
                <button
                  className={`ghost-btn ${isMonitorOpen ? "active" : ""}`}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  onClick={() => toggleMonitorPanel(agent.id)}
                  title="Live Monitor"
                  disabled={agent.status !== "active"}
                >
                  📊 Monitor
                </button>
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

              {/* ── Env Vars Panel ── */}
              {isEnvOpen && (
                <div className="agent-panel">
                  <p className="panel-label">Environment Variables</p>
                  <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 10 }}>
                    API keys and config pushed directly to your agent&apos;s Railway container.
                  </p>
                  {isEnvLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p>}
                  {!isEnvLoading && (
                    <>
                      {Object.keys(agentEnv).length === 0 && (
                        <p className="muted" style={{ fontSize: "0.8rem" }}>No variables yet.</p>
                      )}
                      {Object.entries(agentEnv).map(([k, v]) => {
                        const masked = envMasked[agent.id]?.has(k) ?? true;
                        return (
                          <div key={k} className="env-row">
                            <span className="env-key">{k}</span>
                            <span className="env-val">
                              {masked ? "••••••••" : v}
                            </span>
                            <button
                              className="ghost-btn"
                              style={{ fontSize: "0.7rem", padding: "3px 8px" }}
                              onClick={() =>
                                setEnvMasked((prev) => {
                                  const copy = { ...prev };
                                  const set = new Set(copy[agent.id] ?? []);
                                  masked ? set.delete(k) : set.add(k);
                                  copy[agent.id] = set;
                                  return copy;
                                })
                              }
                            >
                              {masked ? "Show" : "Hide"}
                            </button>
                            <button
                              className="ghost-btn"
                              style={{ fontSize: "0.7rem", padding: "3px 8px", color: "var(--danger)", borderColor: "rgba(255,77,109,0.3)" }}
                              onClick={() => deleteEnvVar(agent.id, k)}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                      <div className="env-add-row" style={{ marginTop: 10 }}>
                        <input
                          className="auth-input"
                          style={{ fontSize: "0.8rem", padding: "6px 10px", flex: "0 0 38%" }}
                          placeholder="KEY"
                          value={newEnvKey[agent.id] ?? ""}
                          onChange={(e) => setNewEnvKey((p) => ({ ...p, [agent.id]: e.target.value }))}
                        />
                        <input
                          className="auth-input"
                          style={{ fontSize: "0.8rem", padding: "6px 10px", flex: 1 }}
                          placeholder="value"
                          type="password"
                          value={newEnvVal[agent.id] ?? ""}
                          onChange={(e) => setNewEnvVal((p) => ({ ...p, [agent.id]: e.target.value }))}
                        />
                        <button
                          className="solid-btn"
                          style={{ fontSize: "0.8rem", padding: "6px 14px", whiteSpace: "nowrap" }}
                          onClick={() => saveEnvVar(agent.id)}
                        >
                          + Save
                        </button>
                      </div>
                      {panelError[agent.id + "_env"] && (
                        <p className="status err" style={{ fontSize: "0.78rem", marginTop: 6 }}>
                          {panelError[agent.id + "_env"]}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {isChannelsOpen && (
                <div className="agent-panel">
                  <p className="panel-label">Channels</p>
                  <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 10 }}>
                    Enable channels for this agent. Saving triggers redeploy on Railway.
                  </p>
                  {isChannelsLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading...</p>}
                  {!isChannelsLoading && (
                    <>
                      {agentChannelRows.length === 0 && (
                        <p className="muted" style={{ fontSize: "0.8rem" }}>No channel config loaded.</p>
                      )}
                      {CHANNEL_OPTIONS.map((option) => {
                        const row = agentChannelRows.find((r) => r.channel === option.key);
                        const enabled = row?.enabled ?? false;
                        const hasToken = row?.hasToken ?? false;
                        return (
                          <div
                            key={option.key}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "120px 80px 1fr",
                              gap: 8,
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <strong style={{ fontSize: "0.82rem" }}>{option.label}</strong>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setChannelEnabled(agent.id, option.key, e.target.checked)}
                              />
                              On
                            </label>
                            <input
                              className="auth-input"
                              style={{ fontSize: "0.78rem", padding: "6px 10px" }}
                              type="password"
                              placeholder={hasToken ? `Configured - enter new token to rotate (${option.placeholder})` : option.placeholder}
                              value={channelTokenDrafts[option.key] ?? ""}
                              onChange={(e) =>
                                setChannelTokens((prev) => ({
                                  ...prev,
                                  [agent.id]: {
                                    ...(prev[agent.id] ?? ({} as Record<ChannelKey, string>)),
                                    [option.key]: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        );
                      })}
                      <button
                        className="solid-btn"
                        style={{ fontSize: "0.8rem", padding: "6px 14px", marginTop: 4 }}
                        onClick={() => saveChannels(agent.id)}
                      >
                        Save Channels
                      </button>
                      {panelError[agent.id + "_channels"] && (
                        <p className="status err" style={{ fontSize: "0.78rem", marginTop: 6 }}>
                          {panelError[agent.id + "_channels"]}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Knowledge Base Panel ── */}
              {isKbOpen && (
                <div className="agent-panel">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <p className="panel-label" style={{ margin: 0 }}>Knowledge Base</p>
                    <label
                      style={{
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                      }}
                      title="Upload PDF, TXT, MD, CSV, JSON…"
                    >
                      📎 Upload File
                      <input
                        type="file"
                        accept=".pdf,.txt,.md,.markdown,.csv,.json,.jsonl,.yaml,.yml,.xml,.log,.rst"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadKbFile(agent.id, file);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 10 }}>
                    Add text your agent can reference. Ask it anything about stored content.
                  </p>
                  {isKbLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p>}
                  {!isKbLoading && (
                    <>
                      {agentDocs.length === 0 && (
                        <p className="muted" style={{ fontSize: "0.8rem" }}>No knowledge docs yet.</p>
                      )}
                      {agentDocs.map((doc) => (
                        <div key={doc.id} className="kb-item">
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.85rem" }}>{doc.title}</p>
                            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.75rem" }}>
                              {doc.content.slice(0, 120)}{doc.content.length > 120 ? "…" : ""}
                            </p>
                          </div>
                          <button
                            className="ghost-btn"
                            style={{ fontSize: "0.7rem", padding: "3px 8px", color: "var(--danger)", borderColor: "rgba(255,77,109,0.3)" }}
                            onClick={() => deleteKnowledgeDoc(agent.id, doc.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          className="auth-input"
                          style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                          placeholder="Title (e.g. Company Overview)"
                          value={newKbTitle[agent.id] ?? ""}
                          onChange={(e) => setNewKbTitle((p) => ({ ...p, [agent.id]: e.target.value }))}
                        />
                        <textarea
                          className="auth-input"
                          style={{ fontSize: "0.8rem", padding: "8px 10px", minHeight: 90, resize: "vertical", fontFamily: "var(--font-mono)" }}
                          placeholder="Paste your content here…"
                          value={newKbContent[agent.id] ?? ""}
                          onChange={(e) => setNewKbContent((p) => ({ ...p, [agent.id]: e.target.value }))}
                        />
                        <button
                          className="solid-btn"
                          style={{ fontSize: "0.8rem", padding: "6px 14px", alignSelf: "flex-start" }}
                          onClick={() => addKnowledgeDoc(agent.id)}
                        >
                          + Add to Knowledge Base
                        </button>
                      </div>
                      {panelError[agent.id + "_kb"] && (
                        <p className="status err" style={{ fontSize: "0.78rem", marginTop: 6 }}>
                          {panelError[agent.id + "_kb"]}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* ── Monitor Panel ── */}
              {isMonitorOpen && (
                <MonitorPanel
                  agentId={agent.id}
                  data={agentMonitor}
                  loading={isMonitorLoading}
                  onRefresh={() => loadMonitor(agent.id)}
                />
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
