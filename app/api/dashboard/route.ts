import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDashboardSql, type DashboardRow } from "@/lib/dashboard-query";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const query = buildDashboardSql(user.email, 50);
  const deployments = await prisma.$queryRawUnsafe<DashboardRow[]>(
    query.text,
    ...query.values,
  );

  return NextResponse.json({
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    deployments,
  });
}
