import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeStringArray,
  normalizeStringMap,
} from "@/lib/people-memory";
import { syncMeshEnvForUser } from "@/lib/provisioner";

async function resolveUser(email: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data ?? null;
}

async function verifyAgentOwnership(agentId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .single();
  return Boolean(data);
}

function serializePerson(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    canonical_name: String(row.canonical_name ?? ""),
    aliases: normalizeStringArray(row.aliases),
    relationship: typeof row.relationship === "string" ? row.relationship : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    preferences: typeof row.preferences === "string" ? row.preferences : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    channel_identities: normalizeStringMap(row.channel_identities),
    first_seen_at: typeof row.first_seen_at === "string" ? row.first_seen_at : null,
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
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

    if (!(await verifyAgentOwnership(params.id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_people")
      .select(
        "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      people: (data ?? []).map((row) => serializePerson(row as Record<string, unknown>)),
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
  personId?: string;
  canonicalName?: string;
  aliases?: unknown;
  relationship?: string | null;
  summary?: string | null;
  preferences?: string | null;
  notes?: string | null;
  channelIdentities?: unknown;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
};

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as UpsertBody;
    const canonicalName = body.canonicalName?.trim();
    if (!body.email || !canonicalName) {
      return NextResponse.json(
        { error: "email and canonicalName are required" },
        { status: 400 }
      );
    }

    const user = await resolveUser(body.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!(await verifyAgentOwnership(params.id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const payload = {
      canonical_name: canonicalName,
      aliases: normalizeStringArray(body.aliases),
      relationship: body.relationship?.trim() || null,
      summary: body.summary?.trim() || null,
      preferences: body.preferences?.trim() || null,
      notes: body.notes?.trim() || null,
      channel_identities: normalizeStringMap(body.channelIdentities),
      last_seen_at: body.lastSeenAt?.trim() || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let person;
    if (body.personId) {
      const { data, error } = await supabase
        .from("agent_people")
        .update(payload)
        .eq("id", body.personId)
        .eq("agent_id", params.id)
        .eq("user_id", user.id)
        .select(
          "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Update failed" },
          { status: 500 }
        );
      }
      person = data;
    } else {
      const firstSeenAt = body.firstSeenAt?.trim() || payload.last_seen_at;
      const { data, error } = await supabase
        .from("agent_people")
        .insert({
          agent_id: params.id,
          user_id: user.id,
          first_seen_at: firstSeenAt,
          ...payload,
        })
        .select(
          "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        const status =
          error?.code === "23505" ? 409 : 500;
        return NextResponse.json(
          { error: error?.message ?? "Insert failed" },
          { status }
        );
      }
      person = data;
    }

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      person: serializePerson(person as Record<string, unknown>),
      warning: syncWarning,
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
    const body = (await req.json()) as { email?: string; personId?: string };
    if (!body.email || !body.personId) {
      return NextResponse.json(
        { error: "email and personId are required" },
        { status: 400 }
      );
    }

    const user = await resolveUser(body.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    await supabase
      .from("agent_people")
      .delete()
      .eq("id", body.personId)
      .eq("agent_id", params.id)
      .eq("user_id", user.id);

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({ ok: true, warning: syncWarning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
