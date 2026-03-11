import { NextResponse } from "next/server";
import { extractClaudeSessionCredential } from "@/lib/session-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { input?: string };
    const credential = extractClaudeSessionCredential(body.input ?? "");
    return NextResponse.json({
      credential,
      provider: "claude_token",
      tokenType: "session_key",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
