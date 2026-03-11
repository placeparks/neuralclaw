import { NextRequest, NextResponse } from "next/server";

const CRED_COOKIE = "nc_chatgpt_cred";

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(CRED_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ error: "No credential found." }, { status: 404 });
  }

  const response = NextResponse.json({ credential: raw });
  response.cookies.delete(CRED_COOKIE);
  return response;
}
