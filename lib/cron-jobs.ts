export type AgentCronJob = {
  id: string;
  name: string;
  prompt: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_scheduled_for: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string;
  last_result_preview: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const CRON_FIELD_RE = /^[\d*/,\-]+$/;

export function normalizeCronExpression(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
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
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    prompt: String(row.prompt ?? ""),
    cron_expression: String(row.cron_expression ?? ""),
    timezone: String(row.timezone ?? "UTC"),
    enabled: Boolean(row.enabled),
    last_scheduled_for: typeof row.last_scheduled_for === "string" ? row.last_scheduled_for : null,
    last_started_at: typeof row.last_started_at === "string" ? row.last_started_at : null,
    last_finished_at: typeof row.last_finished_at === "string" ? row.last_finished_at : null,
    last_status: typeof row.last_status === "string" ? row.last_status : "idle",
    last_result_preview: typeof row.last_result_preview === "string" ? row.last_result_preview : null,
    last_error: typeof row.last_error === "string" ? row.last_error : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
