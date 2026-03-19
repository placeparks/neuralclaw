import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isAuthorized(req: Request) {
  const expected = process.env.PROVISIONER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-provisioner-secret")?.trim();
  return Boolean(provided && provided === expected);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string; jobId: string } }
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { scheduledFor?: string };
    const scheduledFor = (body.scheduledFor || "").trim();
    if (!scheduledFor) {
      return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: current, error: loadError } = await supabase
      .from("agent_cron_jobs")
      .select("id, enabled, last_scheduled_for")
      .eq("id", params.jobId)
      .eq("agent_id", params.id)
      .single();

    if (loadError || !current) {
      return NextResponse.json({ error: loadError?.message || "Job not found" }, { status: 404 });
    }
    if (!current.enabled) {
      return NextResponse.json({ claimed: false, reason: "disabled" });
    }
    if (current.last_scheduled_for === scheduledFor) {
      return NextResponse.json({ claimed: false, reason: "already_claimed" });
    }

    const { error: updateError } = await supabase
      .from("agent_cron_jobs")
      .update({
        last_scheduled_for: scheduledFor,
        last_started_at: new Date().toISOString(),
        last_status: "running",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.jobId)
      .eq("agent_id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ claimed: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
