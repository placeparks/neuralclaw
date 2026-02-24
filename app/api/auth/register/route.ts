import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashPassword } from "@/lib/password";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; email?: string; password?: string };
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!name || !email.includes("@") || password.length < 6) {
      return NextResponse.json({ error: "Invalid registration payload." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const existing = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing.data) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 });
    }

    const { hash, salt } = hashPassword(password);
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        email,
        display_name: name,
        password_hash: hash,
        password_salt: salt
      })
      .select("id, email, display_name")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Unable to create user." }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        id: data.id,
        email: data.email,
        name: data.display_name
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
