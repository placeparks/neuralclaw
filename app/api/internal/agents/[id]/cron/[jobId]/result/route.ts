import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isAuthorized(req: Request): boolean {
  const expected = process.env.PROVISIONER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-provisioner-secret")?.trim();
  return Boolean(provided && provided == expected);
}

export async function POST(req: Request, { params }: { params: { id: string; jobId: string } }) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const status = String(body.status ?? "failed").trim();
    const preview = String(body.resultPreview ?? "").trim() || null;
    const errorText = String(body.error ?? "").trim() || null;

    const supabase = getSupabaseAdmin();
    const { data: existing, error: loadError } = await supabase
      .from("agent_cron_jobs")
      .select("delete_after_run")
      .eq("id", params.jobId)
      .eq("agent_id", params.id)
      .single();
    if (loadError || !existing) return NextResponse.json({ error: loadError?.message ?? "Job not found" }, { status: 404 });

    const payload: Record<string, unknown> = {
      last_finished_at: new Date().toISOString(),
      last_status: status,
      last_result_preview: preview,
      last_error: errorText,
      updated_at: new Date().toISOString(),
    };
    if (status === "completed" && existing.delete_after_run) {
      payload.enabled = false;
    }

    const { error } = await supabase
      .from("agent_cron_jobs")
      .update(payload)
      .eq("id", params.jobId)
      .eq("agent_id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
