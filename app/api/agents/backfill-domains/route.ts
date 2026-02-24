import { NextResponse } from "next/server";
import { backfillDomains } from "@/lib/provisioner";

// POST /api/agents/backfill-domains
// Generates Railway public domains for all active agents that are missing one,
// then re-syncs NEURALCLAW_MESH_PEERS_JSON on every affected service.
//
// Optional body: { "userId": "<uuid>" }  — limit to one user.
// Auth: same PROVISIONER_SECRET header used by /api/provision/run.
export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.PROVISIONER_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-provisioner-secret");
      if (!provided || provided !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const result = await backfillDomains(body.userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
