import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildOneTimeFallbackCron,
  buildOneTimeFallbackName,
  isValidCronExpression,
  isValidTimezone,
  normalizeCronExpression,
  serializeCronJob,
} from "@/lib/cron-jobs";

function isMissingDeleteAfterRun(errorMessage: string | null | undefined): boolean {
  const text = String(errorMessage || "").toLowerCase();
  return text.includes("delete_after_run") && (text.includes("schema cache") || text.includes("column"));
}

function isCronExpressionRequired(errorMessage: string | null | undefined): boolean {
  const text = String(errorMessage || "").toLowerCase();
  return text.includes("cron_expression") && text.includes("not-null constraint");
}

async function resolveUserId(email: string) {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return user?.id ?? null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const userId = await resolveUserId(email);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", userId)
      .single();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("agent_cron_jobs")
      .select("*")
      .eq("agent_id", params.id)
      .eq("user_id", userId)
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
    const body = await req.json();
    const email = String(body.email ?? "").trim();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const userId = await resolveUserId(email);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const name = String(body.name ?? "").trim();
    const prompt = String(body.prompt ?? "").trim();
    const cronExpressionRaw = String(body.cronExpression ?? "").trim();
    const runOnceAtRaw = String(body.runOnceAt ?? "").trim();
    const timezone = String(body.timezone ?? "UTC").trim() || "UTC";
    const enabled = body.enabled !== false;
    const deleteAfterRun = Boolean(body.deleteAfterRun);
    const jobId = String(body.jobId ?? "").trim();

    if (!name || !prompt) {
      return NextResponse.json({ error: "Name and prompt are required" }, { status: 400 });
    }
    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const hasCron = Boolean(cronExpressionRaw);
    const hasRunOnce = Boolean(runOnceAtRaw);
    if (hasCron === hasRunOnce) {
      return NextResponse.json({ error: "Choose either a cron expression or a one-time run timestamp" }, { status: 400 });
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
      .select("id")
      .eq("id", params.id)
      .eq("user_id", userId)
      .single();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const payload = {
      agent_id: params.id,
      user_id: userId,
      name,
      prompt,
      cron_expression: cronExpression,
      timezone,
      run_once_at: runOnceAt,
      delete_after_run: deleteAfterRun,
      enabled,
      updated_at: new Date().toISOString(),
    };

    let result = jobId
      ? await supabase
          .from("agent_cron_jobs")
          .update(payload)
          .eq("id", jobId)
          .eq("agent_id", params.id)
          .eq("user_id", userId)
          .select("*")
          .single()
      : await supabase
          .from("agent_cron_jobs")
          .insert(payload)
          .select("*")
          .single();

    if (result.error && isMissingDeleteAfterRun(result.error.message)) {
      const { delete_after_run: _ignored, ...fallbackPayload } = payload;
      result = jobId
        ? await supabase
            .from("agent_cron_jobs")
            .update(fallbackPayload)
            .eq("id", jobId)
            .eq("agent_id", params.id)
            .eq("user_id", userId)
            .select("*")
            .single()
        : await supabase
            .from("agent_cron_jobs")
            .insert(fallbackPayload)
            .select("*")
            .single();
    }

    if (result.error && runOnceAt && isCronExpressionRequired(result.error.message)) {
      const fallbackPayload = {
        ...payload,
        name: buildOneTimeFallbackName(name, runOnceAt),
        cron_expression: buildOneTimeFallbackCron(runOnceAt, timezone),
      };
      delete (fallbackPayload as { run_once_at?: string | null }).run_once_at;
      delete (fallbackPayload as { delete_after_run?: boolean }).delete_after_run;
      result = jobId
        ? await supabase
            .from("agent_cron_jobs")
            .update(fallbackPayload)
            .eq("id", jobId)
            .eq("agent_id", params.id)
            .eq("user_id", userId)
            .select("*")
            .single()
        : await supabase
            .from("agent_cron_jobs")
            .insert(fallbackPayload)
            .select("*")
            .single();
    }

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message ?? "Unable to save schedule" }, { status: 500 });
    }

    return NextResponse.json({ job: serializeCronJob(result.data as Record<string, unknown>) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim();
    const jobId = String(body.jobId ?? "").trim();
    if (!email || !jobId) {
      return NextResponse.json({ error: "Missing email or jobId" }, { status: 400 });
    }
    const userId = await resolveUserId(email);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agent_cron_jobs")
      .delete()
      .eq("id", jobId)
      .eq("agent_id", params.id)
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
