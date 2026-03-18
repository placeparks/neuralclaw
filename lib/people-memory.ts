export type AgentPersonMemory = {
  id: string;
  canonical_name: string;
  aliases: string[];
  relationship: string | null;
  summary: string | null;
  preferences: string | null;
  notes: string | null;
  channel_identities: Record<string, string>;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = key.trim();
    const cleanValue = typeof raw === "string" ? raw.trim() : "";
    if (cleanKey && cleanValue) {
      out[cleanKey] = cleanValue;
    }
  }
  return out;
}

export function parseAliasesDraft(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseChannelIdentitiesDraft(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) {
      out[key] = value;
    }
  }
  return out;
}

export function formatChannelIdentitiesDraft(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function buildPeopleMemoryContent(people: AgentPersonMemory[]): string {
  if (people.length === 0) return "";

  const entries = people.map((person) => {
    const lines: string[] = [`Person: ${person.canonical_name}`];

    if (person.aliases.length > 0) {
      lines.push(`Aliases: ${person.aliases.join(", ")}`);
    }
    if (person.relationship) {
      lines.push(`Relationship: ${person.relationship}`);
    }
    if (person.summary) {
      lines.push(`Summary: ${person.summary}`);
    }
    if (person.preferences) {
      lines.push(`Preferences: ${person.preferences}`);
    }
    const identities = Object.entries(person.channel_identities);
    if (identities.length > 0) {
      lines.push(
        `Channel identities: ${identities
          .map(([key, value]) => `${key}=${value}`)
          .join(", ")}`
      );
    }
    if (person.notes) {
      lines.push(`Notes: ${person.notes}`);
    }
    if (person.last_seen_at) {
      lines.push(`Last seen: ${person.last_seen_at}`);
    }

    return lines.join("\n");
  });

  return ["=== PEOPLE MEMORY ===", ...entries].join("\n\n");
}
