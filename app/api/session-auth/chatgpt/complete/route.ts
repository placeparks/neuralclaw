import { NextResponse } from "next/server";
import { exchangeChatGPTCallback, serializeCredential } from "@/lib/session-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { flowToken?: string; callbackUrl?: string };
    if (!body.flowToken || !body.callbackUrl) {
      return NextResponse.json({ error: "flowToken and callbackUrl are required." }, { status: 400 });
    }

    const credential = await exchangeChatGPTCallback(body.flowToken, body.callbackUrl);
    return NextResponse.json({
      credential: serializeCredential(credential),
      provider: "chatgpt_token",
      tokenType: credential.token_type,
      expiresAt: credential.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
