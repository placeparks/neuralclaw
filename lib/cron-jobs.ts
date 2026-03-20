export type AgentCronJob = {
  id: string;
  agent_id: string;
  user_id: string;
  name: string;
  prompt: string;
  cron_expression: string | null;
  timezone: string;
  run_once_at: string | null;
  delete_after_run: boolean;
  delivery_channel: string | null;
  delivery_channel_id: string | null;
  delivery_author_id: string | null;
  delivery_author_name: string | null;
  enabled: boolean;
  last_scheduled_for: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string | null;
  last_result_preview: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const CRON_FIELD_RE = /^[\d*/,\-]+$/;
const ONE_TIME_FALLBACK_RE = /^\[NC_RUN_ONCE:([^\]]+)\]\s*/i;

export function normalizeCronExpression(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function buildOneTimeFallbackName(name: string, runOnceAt: string): string {
  return `[NC_RUN_ONCE:${runOnceAt}] ${name}`.trim();
}

export function extractOneTimeFallbackRunOnceAt(value: string | null | undefined): string | null {
  const match = String(value || "").match(ONE_TIME_FALLBACK_RE);
  return match?.[1]?.trim() || null;
}

export function stripOneTimeFallbackName(value: string | null | undefined): string {
  return String(value || "").replace(ONE_TIME_FALLBACK_RE, "").trim();
}

export function buildOneTimeFallbackCron(runOnceAt: string, timezone: string): string {
  const date = new Date(runOnceAt);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "numeric",
    hour: "numeric",
    day: "numeric",
    month: "numeric",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const minute = String(Number(parts.minute ?? 0));
  const hour = String(Number(parts.hour ?? 0));
  const day = String(Number(parts.day ?? 1));
  const month = String(Number(parts.month ?? 1));
  return `${minute} ${hour} ${day} ${month} *`;
}

export function isValidCronExpression(value: string | null | undefined): boolean {
  const normalized = normalizeCronExpression(value);
  const parts = normalized.split(" ");
  if (parts.length !== 5) return false;
  return parts.every((part) => part.length > 0 && CRON_FIELD_RE.test(part));
}

export function isValidTimezone(value: string | null | undefined): boolean {
  const timezone = (value || "").trim();
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function serializeCronJob(row: Record<string, unknown>): AgentCronJob {
  const rawName = String(row.name ?? "");
  const fallbackRunOnceAt = row.run_once_at ? null : extractOneTimeFallbackRunOnceAt(rawName);
  return {
    id: String(row.id ?? ""),
    agent_id: String(row.agent_id ?? ""),
    user_id: String(row.user_id ?? ""),
    name: stripOneTimeFallbackName(rawName),
    prompt: String(row.prompt ?? ""),
    cron_expression: row.cron_expression ? String(row.cron_expression) : null,
    timezone: String(row.timezone ?? "UTC"),
    run_once_at: row.run_once_at ? String(row.run_once_at) : fallbackRunOnceAt,
    delete_after_run: row.delete_after_run != null ? Boolean(row.delete_after_run) : Boolean(fallbackRunOnceAt),
    delivery_channel: row.delivery_channel ? String(row.delivery_channel) : null,
    delivery_channel_id: row.delivery_channel_id ? String(row.delivery_channel_id) : null,
    delivery_author_id: row.delivery_author_id ? String(row.delivery_author_id) : null,
    delivery_author_name: row.delivery_author_name ? String(row.delivery_author_name) : null,
    enabled: Boolean(row.enabled),
    last_scheduled_for: row.last_scheduled_for ? String(row.last_scheduled_for) : null,
    last_started_at: row.last_started_at ? String(row.last_started_at) : null,
    last_finished_at: row.last_finished_at ? String(row.last_finished_at) : null,
    last_status: row.last_status ? String(row.last_status) : null,
    last_result_preview: row.last_result_preview ? String(row.last_result_preview) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
