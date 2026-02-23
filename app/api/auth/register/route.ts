import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, cookieHeader, hashPassword } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "User already exists." }, { status: 409 });
    }

    await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
      },
    });

    const token = createSessionToken(email);
    const res = NextResponse.json({ ok: true, email });
    res.headers.set("Set-Cookie", cookieHeader(token));
    return res;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: `Database request failed (${error.code}).` },
        { status: 500 },
      );
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        { error: "Database connection failed. Check DATABASE_URL/DIRECT_URL." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Registration failed due to server error." },
      { status: 500 },
    );
  }
}
