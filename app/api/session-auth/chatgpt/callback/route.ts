import { NextRequest, NextResponse } from "next/server";
import { exchangeChatGPTCallback, serializeCredential } from "@/lib/session-auth";

const FLOW_COOKIE = "nc_chatgpt_flow";
const CRED_COOKIE = "nc_chatgpt_cred";
const CRED_TTL_SECONDS = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const error = searchParams.get("error");

  if (error) {
    const desc = searchParams.get("error_description") ?? error;
    return redirectToOnboard(req, null, encodeURIComponent(desc));
  }

  const flowToken = req.cookies.get(FLOW_COOKIE)?.value;
  if (!flowToken) {
    return redirectToOnboard(req, null, encodeURIComponent("Auth session expired. Please try again."));
  }

  try {
    const credential = await exchangeChatGPTCallback(flowToken, req.url);
    const serialized = serializeCredential(credential);

    const response = redirectToOnboard(req, "1", null);
    response.cookies.set(CRED_COOKIE, serialized, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: CRED_TTL_SECONDS,
    });
    response.cookies.delete(FLOW_COOKIE);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth exchange failed.";
    return redirectToOnboard(req, null, encodeURIComponent(message));
  }
}

function redirectToOnboard(req: NextRequest, connected: string | null, errorMsg: string | null) {
  const base = new URL(req.url).origin;
  const dest = new URL("/onboard", base);
  if (connected) dest.searchParams.set("chatgpt_connected", connected);
  if (errorMsg) dest.searchParams.set("chatgpt_error", errorMsg);
  return NextResponse.redirect(dest);
}
