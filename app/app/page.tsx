"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearStoredUser, getMeshEnabled, getStoredUser, setMeshEnabled } from "@/lib/session-client";

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
    setLoading(false);

    if (list.length === 0) {
      router.replace("/onboard");
    }
  }, [router]);

  useEffect(() => {
    setMesh(getMeshEnabled());
    refresh().catch(() => setLoading(false));
  }, [refresh]);

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
          onClick={() => {
            const next = !meshEnabled;
            setMesh(next);
            setMeshEnabled(next);
          }}
        />
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
