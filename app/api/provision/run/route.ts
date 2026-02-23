import { NextResponse } from "next/server";
import { runProvision } from "@/lib/provisioner";

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.PROVISIONER_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-provisioner-secret");
      if (!provided || provided !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.max(1, Math.min(body.limit ?? 3, 10));

    const result = await runProvision(limit);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected provisioner error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
