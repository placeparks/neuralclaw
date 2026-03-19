import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { serializeCronJob } from "@/lib/cron-jobs";

// GET /api/agents/[id]/monitor?email=...
// Proxies /api/stats, /api/traces, and /api/audit from the agent's Railway domain,
// then joins recent schedule state from Supabase for a unified dashboard view.
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data: agent } = await supabase
      .from("agents")
      .select("railway_domain, status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const { data: jobs, error: jobsError } = await supabase
      .from("agent_cron_jobs")
      .select("*")
      .eq("agent_id", params.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(12);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const serializedJobs = (jobs ?? []).map((row) => serializeCronJob(row as Record<string, unknown>));

    if (!agent.railway_domain) {
      return NextResponse.json({ stats: {}, traces: [], audit: [], auditStats: {}, jobs: serializedJobs });
    }

    const domain = agent.railway_domain;
    const secret = process.env.PROVISIONER_SECRET?.trim();
    const headers = secret ? { "x-provisioner-secret": secret } : undefined;
    const [statsRes, tracesRes, auditRes] = await Promise.allSettled([
      fetch(`${domain}/api/stats`, { signal: AbortSignal.timeout(5000), headers }),
      fetch(`${domain}/api/traces?limit=20`, { signal: AbortSignal.timeout(5000), headers }),
      fetch(`${domain}/api/audit?limit=20`, { signal: AbortSignal.timeout(5000), headers }),
    ]);

    const stats =
      statsRes.status === "fulfilled" && statsRes.value.ok
        ? await statsRes.value.json()
        : {};
    const traces =
      tracesRes.status === "fulfilled" && tracesRes.value.ok
        ? await tracesRes.value.json()
        : [];
    const audit =
      auditRes.status === "fulfilled" && auditRes.value.ok
        ? await auditRes.value.json()
        : { records: [], stats: {} };

    return NextResponse.json({
      stats,
      traces,
      audit: audit.records ?? [],
      auditStats: audit.stats ?? {},
      jobs: serializedJobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
