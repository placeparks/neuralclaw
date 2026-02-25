import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncMeshEnvForUser } from "@/lib/provisioner";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CHARS = 50_000;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml",
  "xml", "html", "htm", "log", "rst", "tex",
]);

async function resolveUser(email: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data ?? null;
}

async function verifyAgentOwnership(agentId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .single();
  return Boolean(data);
}

async function extractText(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (ext === "pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buf);
    return (result.text as string).trim();
  }

  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) {
    return buf.toString("utf-8");
  }

  // Unknown type — attempt UTF-8 decode, throw if it looks binary
  const text = buf.toString("utf-8");
  if (text.includes("\x00")) {
    throw new Error(`Unsupported file type ".${ext}". Supported: PDF, TXT, MD, CSV, JSON, and other plain-text formats.`);
  }
  return text;
}

// POST /api/agents/[id]/knowledge/upload  — multipart/form-data: email, file
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await req.formData();
    const email = formData.get("email") as string | null;
    const file = formData.get("file") as File | null;

    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!file || file.size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
    }

    const user = await resolveUser(email);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    if (!(await verifyAgentOwnership(params.id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let content: string;
    try {
      content = await extractText(file);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not parse file" },
        { status: 422 }
      );
    }

    content = content.trim();
    if (!content) {
      return NextResponse.json({ error: "File appears to be empty or has no readable text" }, { status: 422 });
    }

    const title = file.name.replace(/\.[^.]+$/, "");

    const supabase = getSupabaseAdmin();
    const { data: doc, error } = await supabase
      .from("agent_knowledge")
      .insert({
        agent_id: params.id,
        user_id: user.id,
        title,
        content: content.slice(0, MAX_CHARS),
      })
      .select("id, title, content, created_at")
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    let syncWarning: string | null = null;
    try {
      await syncMeshEnvForUser(user.id);
    } catch (e) {
      syncWarning = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({ doc, warning: syncWarning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
