import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { serializeCronJob } from "@/lib/cron-jobs";

function isAuthorized(req: Request) {
  const expected = process.env.PROVISIONER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-provisioner-secret")?.trim();
  return Boolean(provided && provided === expected);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_cron_jobs")
      .select(
        "id, name, prompt, cron_expression, timezone, enabled, last_scheduled_for, last_started_at, last_finished_at, last_status, last_result_preview, last_error, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .eq("enabled", true)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      jobs: (data ?? []).map((row) => serializeCronJob(row as Record<string, unknown>)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
