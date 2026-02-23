import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 404 });
  }
  return NextResponse.json({ authenticated: true, email: session.email });
}
