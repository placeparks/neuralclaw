import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeStringArray,
  normalizeStringMap,
} from "@/lib/people-memory";
import { syncMeshEnvForUser } from "@/lib/provisioner";

type IngestBody = {
  platform?: string;
  platformUserId?: string;
  displayName?: string;
  preferredName?: string | null;
  aliases?: unknown;
  relationship?: string | null;
  summary?: string | null;
  preferences?: string | null;
  notes?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  channelIdentities?: unknown;
};

function normalizeName(value: string | null | undefined): string {
  return (value || "").trim();
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const clean = item.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function appendNotes(existing: string | null, incoming: string | null): string | null {
  const left = (existing || "").trim();
  const right = (incoming || "").trim();
  if (!left) return right || null;
  if (!right) return left;
  if (left.toLowerCase().includes(right.toLowerCase())) {
    return left;
  }
  return `${left}\n${right}`;
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

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const expectedSecret = process.env.PROVISIONER_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-provisioner-secret");
      if (!provided || provided !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json()) as IngestBody;
    const platform = normalizeName(body.platform).toLowerCase();
    const platformUserId = normalizeName(body.platformUserId);
    if (!platform || !platformUserId) {
      return NextResponse.json(
        { error: "platform and platformUserId are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agentRow, error: agentError } = await supabase
      .from("agents")
      .select("id, user_id")
      .eq("id", params.id)
      .single();

    if (agentError || !agentRow) {
      return NextResponse.json(
        { error: agentError?.message || "Agent not found" },
        { status: 404 }
      );
    }

    const preferredName = normalizeName(body.preferredName);
    const displayName = normalizeName(body.displayName);
    const fallbackName = preferredName || displayName || platformUserId;
    const requestAliases = normalizeStringArray(body.aliases);
    const requestIdentities = normalizeStringMap(body.channelIdentities);
    const nextIdentities = {
      ...requestIdentities,
      [platform]: platformUserId,
    };

    const { data: existingRows, error: loadError } = await supabase
      .from("agent_people")
      .select(
        "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
      )
      .eq("agent_id", params.id)
      .eq("user_id", agentRow.user_id)
      .order("updated_at", { ascending: false });

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const nameCandidates = mergeUniqueStrings(
      [fallbackName],
      preferredName ? [preferredName] : [],
      displayName ? [displayName] : [],
      requestAliases
    ).map((value) => lower(value));

    const existing = (existingRows ?? []).find((row) => {
      const person = row as Record<string, unknown>;
      const identities = normalizeStringMap(person.channel_identities);
      if (identities[platform] === platformUserId) return true;

      const canonical = lower(String(person.canonical_name ?? ""));
      if (canonical && nameCandidates.includes(canonical)) return true;

      const aliases = normalizeStringArray(person.aliases).map((value) => lower(value));
      return aliases.some((alias) => nameCandidates.includes(alias));
    }) as Record<string, unknown> | undefined;

    const nowIso = new Date().toISOString();
    const summary = normalizeName(body.summary) || null;
    const preferences = normalizeName(body.preferences) || null;
    const relationship = normalizeName(body.relationship) || null;
    const notes = normalizeName(body.notes) || null;

    let saved;
    if (existing) {
      const mergedAliases = mergeUniqueStrings(
        normalizeStringArray(existing.aliases),
        requestAliases,
        preferredName && lower(preferredName) !== lower(String(existing.canonical_name ?? ""))
          ? [preferredName]
          : [],
        displayName && lower(displayName) !== lower(String(existing.canonical_name ?? ""))
          ? [displayName]
          : []
      ).filter((value) => lower(value) !== lower(preferredName || String(existing.canonical_name ?? fallbackName)));

      const mergedIdentities = {
        ...normalizeStringMap(existing.channel_identities),
        ...nextIdentities,
      };

      const payload = {
        canonical_name: preferredName || String(existing.canonical_name ?? fallbackName),
        aliases: mergedAliases,
        relationship: relationship || (typeof existing.relationship === "string" ? existing.relationship : null),
        summary: summary || (typeof existing.summary === "string" ? existing.summary : null),
        preferences:
          preferences || (typeof existing.preferences === "string" ? existing.preferences : null),
        notes: appendNotes(
          typeof existing.notes === "string" ? existing.notes : null,
          notes
        ),
        channel_identities: mergedIdentities,
        last_seen_at: normalizeName(body.lastSeenAt) || nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await supabase
        .from("agent_people")
        .update(payload)
        .eq("id", String(existing.id))
        .eq("agent_id", params.id)
        .eq("user_id", agentRow.user_id)
        .select(
          "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Update failed" },
          { status: 500 }
        );
      }
      saved = data;
    } else {
      const aliases = mergeUniqueStrings(
        requestAliases,
        displayName && lower(displayName) !== lower(fallbackName) ? [displayName] : []
      ).filter((value) => lower(value) !== lower(fallbackName));

      const { data, error } = await supabase
        .from("agent_people")
        .insert({
          agent_id: params.id,
          user_id: agentRow.user_id,
          canonical_name: fallbackName,
          aliases,
          relationship,
          summary,
          preferences,
          notes,
          channel_identities: nextIdentities,
          first_seen_at: normalizeName(body.firstSeenAt) || nowIso,
          last_seen_at: normalizeName(body.lastSeenAt) || nowIso,
          updated_at: nowIso,
        })
        .select(
          "id, canonical_name, aliases, relationship, summary, preferences, notes, channel_identities, first_seen_at, last_seen_at, created_at, updated_at"
        )
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Insert failed" },
          { status: error?.code === "23505" ? 409 : 500 }
        );
      }
      saved = data;
    }

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(agentRow.user_id);
    } catch (err) {
      syncWarning = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({
      ok: true,
      person: serializePerson(saved as Record<string, unknown>),
      warning: syncWarning,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
