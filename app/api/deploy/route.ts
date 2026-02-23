import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Channel, Provider } from "@prisma/client";
import { createRailwayInstanceForUser } from "@/lib/railway";

function buildRailwayDeployUrl() {
  const direct = process.env.RAILWAY_DEPLOY_URL;
  if (direct) return direct;

  const slug = process.env.RAILWAY_TEMPLATE_SLUG;
  if (!slug) return null;

  const base = `https://railway.com/deploy/${slug}`;
  const referral = process.env.RAILWAY_REFERRAL_CODE;
  if (!referral) return base;

  return `${base}?referralCode=${encodeURIComponent(referral)}`;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  if (!payload.provider || !payload.plan) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const providerMap: Record<string, Provider> = {
    openai: "OPENAI",
    anthropic: "ANTHROPIC",
    openrouter: "OPENROUTER",
    local: "LOCAL",
  };
  const channelMap: Record<string, Channel> = {
    telegram: "TELEGRAM",
    discord: "DISCORD",
    slack: "SLACK",
    whatsapp: "WHATSAPP",
    signal: "SIGNAL",
  };

  const provider = providerMap[String(payload.provider).toLowerCase()];
  if (!provider) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  const selectedChannels = Array.isArray(payload.channels)
    ? payload.channels
        .map((ch: unknown) => channelMap[String(ch).toLowerCase()])
        .filter(Boolean)
    : [];

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const ownerMode = process.env.RAILWAY_OWNER_MODE === "true";

  // Stripe intentionally disabled for current testing phase.
  // TODO: enable Stripe Checkout before production billing.
  if (ownerMode) {
    try {
      const created = await createRailwayInstanceForUser({
        userEmail: user.email,
        plan: String(payload.plan),
        provider: String(payload.provider),
        channels: selectedChannels.map((c: Channel) => String(c).toLowerCase()),
        providerApiKey: payload.providerApiKey ? String(payload.providerApiKey) : undefined,
      });

      const deployment = await prisma.deployment.create({
        data: {
          userId: user.id,
          plan: String(payload.plan),
          provider,
          channels: selectedChannels,
          status: "DEPLOYING",
          deployUrl: created.consoleUrl,
          railwayProjectId: created.projectId,
          notes: `Created Railway environment ${created.environmentId} on your project.`,
        },
      });

      return NextResponse.json({
        deploymentId: deployment.id,
        status: "DEPLOYING",
        detail: "New Railway instance created in owner project.",
        deployUrl: created.consoleUrl,
      });
    } catch (error) {
      const deployment = await prisma.deployment.create({
        data: {
          userId: user.id,
          plan: String(payload.plan),
          provider,
          channels: selectedChannels,
          status: "FAILED",
          notes: error instanceof Error ? error.message : "Railway owner-mode deploy failed.",
        },
      });
      return NextResponse.json(
        {
          deploymentId: deployment.id,
          error: error instanceof Error ? error.message : "Railway owner-mode deploy failed.",
        },
        { status: 500 },
      );
    }
  }

  const deployUrl = buildRailwayDeployUrl();
  if (!deployUrl) {
    const deployment = await prisma.deployment.create({
      data: {
        userId: user.id,
        plan: String(payload.plan),
        provider,
        channels: selectedChannels,
        status: "FAILED",
        notes:
          "Railway deploy configuration missing. Set owner-mode env vars or template URL settings.",
      },
    });
    return NextResponse.json(
      {
        deploymentId: deployment.id,
        error:
          "Set owner mode vars (RAILWAY_OWNER_MODE=true + token/project/service/base env) or template vars.",
      },
      { status: 500 },
    );
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: user.id,
      plan: String(payload.plan),
      provider,
      channels: selectedChannels,
      status: "REDIRECTED",
      deployUrl,
      notes: "User redirected to Railway one-click deploy flow.",
    },
  });

  return NextResponse.json({
    deploymentId: deployment.id,
    status: "REDIRECTED",
    detail: "Railway one-click deploy ready.",
    deployUrl,
  });
}
