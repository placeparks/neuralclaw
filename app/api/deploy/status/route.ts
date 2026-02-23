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

  const latest = await prisma.deployment.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) {
    return NextResponse.json({
      authenticated: true,
      status: "idle",
      detail: "No deployment started.",
      updatedAt: Date.now(),
    });
  }

  return NextResponse.json({
    authenticated: true,
    deploymentId: latest.id,
    status: latest.status.toLowerCase(),
    detail: latest.notes || "Deployment record found.",
    deployUrl: latest.deployUrl,
    updatedAt: latest.updatedAt.getTime(),
  });
}
