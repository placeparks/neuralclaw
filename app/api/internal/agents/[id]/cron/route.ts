import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidCronExpression, isValidTimezone, normalizeCronExpression, serializeCronJob } from "@/lib/cron-jobs";

function isMissingDeleteAfterRun(errorMessage: string | null | undefined): boolean {
  const text = String(errorMessage || "").toLowerCase();
  return text.includes("delete_after_run") && (text.includes("schema cache") || text.includes("column"));
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.PROVISIONER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-provisioner-secret")?.trim();
  return Boolean(provided && provided === expected);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_cron_jobs")
      .select("*")
      .eq("agent_id", params.id)
      .eq("enabled", true)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: (data ?? []).map((row) => serializeCronJob(row as Record<string, unknown>)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const prompt = String(body.prompt ?? "").trim();
    const cronExpressionRaw = String(body.cronExpression ?? "").trim();
    const runOnceAtRaw = String(body.runOnceAt ?? "").trim();
    const timezone = String(body.timezone ?? "UTC").trim() || "UTC";
    const enabled = body.enabled !== false;
    const deleteAfterRun = Boolean(body.deleteAfterRun);
    const deliveryChannel = String(body.deliveryChannel ?? "").trim() || null;
    const deliveryChannelId = String(body.deliveryChannelId ?? "").trim() || null;
    const deliveryAuthorId = String(body.deliveryAuthorId ?? "").trim() || null;
    const deliveryAuthorName = String(body.deliveryAuthorName ?? "").trim() || null;

    if (!name || !prompt) return NextResponse.json({ error: "Name and prompt are required" }, { status: 400 });
    if (!isValidTimezone(timezone)) return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });

    const hasCron = Boolean(cronExpressionRaw);
    const hasRunOnce = Boolean(runOnceAtRaw);
    if (hasCron === hasRunOnce) {
      return NextResponse.json({ error: "Choose either cronExpression or runOnceAt" }, { status: 400 });
    }

    let cronExpression: string | null = null;
    let runOnceAt: string | null = null;
    if (hasCron) {
      if (!isValidCronExpression(cronExpressionRaw)) {
        return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
      }
      cronExpression = normalizeCronExpression(cronExpressionRaw);
    }
    if (hasRunOnce) {
      const parsed = new Date(runOnceAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid one-time run timestamp" }, { status: 400 });
      }
      runOnceAt = parsed.toISOString();
    }

    const supabase = getSupabaseAdmin();
    const { data: agent } = await supabase
      .from("agents")
      .select("id, user_id")
      .eq("id", params.id)
      .single();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    let result = await supabase
      .from("agent_cron_jobs")
      .insert({
        agent_id: params.id,
        user_id: agent.user_id,
        name,
        prompt,
        cron_expression: cronExpression,
        timezone,
        run_once_at: runOnceAt,
        delete_after_run: deleteAfterRun,
        delivery_channel: deliveryChannel,
        delivery_channel_id: deliveryChannelId,
        delivery_author_id: deliveryAuthorId,
        delivery_author_name: deliveryAuthorName,
        enabled,
      })
      .select("*")
      .single();

    if (result.error && isMissingDeleteAfterRun(result.error.message)) {
      result = await supabase
        .from("agent_cron_jobs")
        .insert({
          agent_id: params.id,
          user_id: agent.user_id,
          name,
          prompt,
          cron_expression: cronExpression,
          timezone,
          run_once_at: runOnceAt,
          delivery_channel: deliveryChannel,
          delivery_channel_id: deliveryChannelId,
          delivery_author_id: deliveryAuthorId,
          delivery_author_name: deliveryAuthorName,
          enabled,
        })
        .select("*")
        .single();
    }
    if (result.error || !result.data) return NextResponse.json({ error: result.error?.message ?? "Unable to create schedule" }, { status: 500 });

    return NextResponse.json({ job: serializeCronJob(result.data as Record<string, unknown>) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
