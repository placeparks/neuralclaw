import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeStringArray, normalizeStringMap } from "@/lib/people-memory";

function isAuthorized(req: Request): boolean {
  const expected = process.env.PROVISIONER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-provisioner-secret")?.trim();
  return Boolean(provided && provided === expected);
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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const platform = String(url.searchParams.get("platform") ?? "").trim().toLowerCase();
    const platformUserId = String(url.searchParams.get("platformUserId") ?? "").trim();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_people")
      .select(
        "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const people = (data ?? []).map((row) => serializePerson(row as Record<string, unknown>));
    let person = null;
    if (platform && platformUserId) {
      person = people.find((entry) => entry.channel_identities?.[platform] === platformUserId) ?? null;
    }

    return NextResponse.json({ person, people });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
