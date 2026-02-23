import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, cookieHeader, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = createSessionToken(email);
  const res = NextResponse.json({ ok: true, email });
  res.headers.set("Set-Cookie", cookieHeader(token));
  return res;
}
