import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const userLookup = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (userLookup.error) {
    return NextResponse.json({ error: userLookup.error.message }, { status: 500 });
  }

  if (!userLookup.data) {
    return NextResponse.json({ agents: [] });
  }

  const { data, error } = await supabase
    .from("agents")
    .select("id, agent_name, plan, provider, model, status, railway_service_id, created_at, updated_at, error_message")
    .eq("user_id", userLookup.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agents: data ?? [] });
}
