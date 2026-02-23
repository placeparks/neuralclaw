export type DashboardRow = {
  id: string;
  email: string;
  plan: string;
  provider: string;
  channels: string[];
  status: string;
  deployUrl: string | null;
  instanceUrl: string | null;
  createdAt: string;
};

export function buildDashboardSql(email: string, limit = 50): { text: string; values: unknown[] } {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  return {
    text: `
      SELECT
        d.id,
        u.email,
        d.plan,
        d.provider::text AS provider,
        ARRAY(SELECT unnest(d.channels)::text) AS channels,
        d.status::text AS status,
        d."deployUrl",
        d."instanceUrl",
        d."createdAt"
      FROM deployments d
      JOIN users u ON u.id = d."userId"
      WHERE u.email = $1
      ORDER BY d."createdAt" DESC
      LIMIT $2
    `,
    values: [email.toLowerCase(), safeLimit],
  };
}
