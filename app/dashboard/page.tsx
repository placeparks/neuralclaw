"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDashboard, logoutUser } from "@/lib/api";
import { Pill } from "@/components/ui";

type Deployment = {
  id: string;
  plan: string;
  provider: string;
  channels: string[];
  status: string;
  deployUrl?: string | null;
  instanceUrl?: string | null;
  createdAt: string;
};

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [status, setStatus] = useState("Loading dashboard...");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await getDashboard();
        setEmail(String((data.user as { email?: string })?.email || ""));
        setDeployments((data.deployments as Deployment[]) || []);
        setStatus("");
      } catch {
        router.push("/login");
      }
    })();
  }, [router]);

  const logout = async () => {
    await logoutUser();
    router.push("/login");
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill>dashboard</Pill>
          <span className="text-xs text-muted">{email}</span>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/onboard" className="text-muted hover:text-text">New Deploy</Link>
          <button onClick={logout} className="text-muted hover:text-text">Logout</button>
        </div>
      </div>

      {status ? <p className="text-sm text-cyan">{status}</p> : null}

      <div className="grid gap-4">
        {deployments.map((d) => (
          <div key={d.id} className="shell-card rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono-tech text-xs uppercase tracking-[0.14em] text-cyan">{d.status}</p>
              <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm">Plan: {d.plan} | Provider: {d.provider}</p>
            <p className="mt-1 text-sm text-muted">Channels: {d.channels?.length ? d.channels.join(", ") : "none"}</p>
            {d.deployUrl ? (
              <a href={d.deployUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-cyan">
                Open deployment link
              </a>
            ) : null}
            {d.instanceUrl ? (
              <a href={d.instanceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-cyan">
                Open instance
              </a>
            ) : null}
          </div>
        ))}
        {!deployments.length && !status ? (
          <div className="shell-card rounded-xl p-6 text-sm text-muted">No deployments yet. Start from onboarding.</div>
        ) : null}
      </div>
    </main>
  );
}
