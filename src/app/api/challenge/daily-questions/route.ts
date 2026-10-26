import { createClient } from "@supabase/supabase-js";
import { isLanguageCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const language = url.searchParams.get("language") ?? "zh-TW";
  if (!isLanguageCode(language)) return Response.json({ error: "語言代碼無效" }, { status: 400 });
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) return Response.json({ error: "題目服務尚未設定" }, { status: 503 });
  const date = todayInTaipei();
  const db = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("get_daily_challenge_questions", { p_date: date, p_language: language });
  if (error) return Response.json({ error: "每日題目載入失敗" }, { status: 503 });
  return Response.json({ date, questions: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
