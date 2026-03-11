import { NextResponse } from "next/server";
import { createChatGPTFlow } from "@/lib/session-auth";

export async function POST() {
  try {
    const flow = createChatGPTFlow();
    return NextResponse.json({
      authUrl: flow.authUrl,
      flowToken: flow.flowToken,
      redirectUri: flow.redirectUri,
      instructions: [
        "Open the auth URL in the same browser where ChatGPT is already signed in.",
        "After approval, the browser will try to open localhost and may fail.",
        "Copy the full localhost callback URL from the address bar and paste it back here.",
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
