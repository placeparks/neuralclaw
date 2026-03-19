import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  isValidCronExpression,
  isValidTimezone,
  normalizeCronExpression,
  serializeCronJob,
} from "@/lib/cron-jobs";

async function resolveUser(email: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data ?? null;
}

async function resolveOwnedAgent(agentId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .single();
  return data ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const user = await resolveUser(email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_cron_jobs")
      .select(
        "id, name, prompt, cron_expression, timezone, enabled, last_scheduled_for, last_started_at, last_finished_at, last_status, last_result_preview, last_error, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

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

type UpsertBody = {
  email?: string;
  jobId?: string;
  name?: string;
  prompt?: string;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
};

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as UpsertBody;
    const email = (body.email || "").trim();
    const name = (body.name || "").trim();
    const prompt = (body.prompt || "").trim();
    const cronExpression = normalizeCronExpression(body.cronExpression);
    const timezone = (body.timezone || "UTC").trim() || "UTC";

    if (!email || !name || !prompt || !cronExpression) {
      return NextResponse.json(
        { error: "email, name, prompt, and cronExpression are required" },
        { status: 400 }
      );
    }
    if (!isValidCronExpression(cronExpression)) {
      return NextResponse.json(
        { error: "Cron expression must use 5 fields (minute hour day month weekday)." },
        { status: 400 }
      );
    }
    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const user = await resolveUser(email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const payload = {
      name,
      prompt,
      cron_expression: cronExpression,
      timezone,
      enabled: body.enabled ?? true,
      updated_at: new Date().toISOString(),
    };

    let saved;
    if (body.jobId) {
      const { data, error } = await supabase
        .from("agent_cron_jobs")
        .update(payload)
        .eq("id", body.jobId)
        .eq("agent_id", params.id)
        .eq("user_id", user.id)
        .select(
          "id, name, prompt, cron_expression, timezone, enabled, last_scheduled_for, last_started_at, last_finished_at, last_status, last_result_preview, last_error, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Update failed" },
          { status: 500 }
        );
      }
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("agent_cron_jobs")
        .insert({
          agent_id: params.id,
          user_id: user.id,
          last_status: "idle",
          ...payload,
        })
        .select(
          "id, name, prompt, cron_expression, timezone, enabled, last_scheduled_for, last_started_at, last_finished_at, last_status, last_result_preview, last_error, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Insert failed" },
          { status: 500 }
        );
      }
      saved = data;
    }

    return NextResponse.json({
      job: serializeCronJob(saved as Record<string, unknown>),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { email?: string; jobId?: string };
    if (!body.email || !body.jobId) {
      return NextResponse.json(
        { error: "email and jobId are required" },
        { status: 400 }
      );
    }

    const user = await resolveUser(body.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const agent = await resolveOwnedAgent(params.id, user.id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agent_cron_jobs")
      .delete()
      .eq("id", body.jobId)
      .eq("agent_id", params.id)
      .eq("user_id", user.id);

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
