import { NextResponse } from "next/server";
import { createChatGPTFlow } from "@/lib/session-auth";

const FLOW_COOKIE = "nc_chatgpt_flow";
const FLOW_TTL_SECONDS = 15 * 60;

function getBaseUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  try {
    const base = getBaseUrl(req);
    const callbackUri = `${base}/api/session-auth/chatgpt/callback`;
    const flow = createChatGPTFlow(callbackUri);

    const response = NextResponse.json({
      authUrl: flow.authUrl,
      // flowToken still returned for the legacy manual-paste fallback
      flowToken: flow.flowToken,
      redirectUri: flow.redirectUri,
      instructions: [
        "Click 'Connect ChatGPT' — you'll be redirected to OpenAI to approve access.",
        "After approval you'll be sent back here automatically.",
        "If the automatic redirect fails, use the manual fallback below.",
      ],
    });

    response.cookies.set(FLOW_COOKIE, flow.flowToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: FLOW_TTL_SECONDS,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
