import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncMeshEnvForUser } from "@/lib/provisioner";

async function getUserIdByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  const row = await supabase
    .from("app_users")
    .select("id, mesh_enabled")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return row;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const user = await getUserIdByEmail(email);
  if (user.error) return NextResponse.json({ error: user.error.message }, { status: 500 });
  if (!user.data) return NextResponse.json({ meshEnabled: false });
  return NextResponse.json({ meshEnabled: user.data.mesh_enabled });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; meshEnabled?: boolean };
    const email = (body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

    const user = await getUserIdByEmail(email);
    if (user.error) return NextResponse.json({ error: user.error.message }, { status: 500 });
    if (!user.data) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const updated = await supabase
      .from("app_users")
      .update({ mesh_enabled: Boolean(body.meshEnabled), updated_at: new Date().toISOString() })
      .eq("id", user.data.id)
      .select("mesh_enabled")
      .single();

    if (updated.error || !updated.data) {
      return NextResponse.json({ error: updated.error?.message || "Failed to update mesh config" }, { status: 500 });
    }

    let syncWarning: string | null = null;
    let syncSummary: Record<string, unknown> | null = null;
    try {
      syncSummary = await syncMeshEnvForUser(user.data.id);
    } catch (syncErr) {
      syncWarning = syncErr instanceof Error ? syncErr.message : "Failed to sync mesh env";
    }

    return NextResponse.json({
      meshEnabled: updated.data.mesh_enabled,
      sync: syncSummary,
      warning: syncWarning
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
