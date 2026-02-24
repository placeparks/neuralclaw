import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/password";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email.includes("@") || !password) {
      return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select("id, email, display_name, password_hash, password_salt")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    if (data.password_hash === "legacy") {
      return NextResponse.json({ error: "Legacy account. Please register again." }, { status: 401 });
    }

    const ok = verifyPassword(password, data.password_hash, data.password_salt);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
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
