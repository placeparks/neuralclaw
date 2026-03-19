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

    const body = (await req.json()) as {
      status?: string;
      resultPreview?: string | null;
      error?: string | null;
      finishedAt?: string | null;
    };

    const status = (body.status || "").trim().toLowerCase();
    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agent_cron_jobs")
      .update({
        last_status: status,
        last_finished_at: (body.finishedAt || "").trim() || new Date().toISOString(),
        last_result_preview: body.resultPreview?.trim() || null,
        last_error: body.error?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.jobId)
      .eq("agent_id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
