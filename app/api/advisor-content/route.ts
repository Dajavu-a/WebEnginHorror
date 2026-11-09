import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer (.+)$/i)?.[1];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!accessToken || !supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return NextResponse.json({ error: "เซสชันไม่ถูกต้อง" }, { status: 401 });
  }

  try {
    const sourcePath = path.join(process.cwd(), "horror_engine_advisor.html");
    const source = await readFile(sourcePath, "utf8");
    const unlocked = source.replace(
      /(<body\b[^>]*\bclass="[^"]*)\slocked(?=[\s"])/i,
      "$1",
    );
    const privacyStyle =
      "<style>#user-bar,#login-screen{display:none!important}</style>";
    const html = unlocked.replace("</head>", `${privacyStyle}</head>`);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to load advisor page", error);
    return NextResponse.json(
      { error: "เปิดหน้าเครื่องมือไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
