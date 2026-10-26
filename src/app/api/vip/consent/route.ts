import { createClient } from "@supabase/supabase-js";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCLOSURE_VERSION = "vip-digital-service-2026-10-11-v1";

export async function POST(request: Request) {
  if (!hasServiceRole()) return Response.json({ error: "無法記錄購買同意" }, { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return Response.json({ error: "請先登入" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "購買服務尚未設定" }, { status: 503 });
  const auth = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return Response.json({ error: "登入狀態已失效" }, { status: 401 });
  let body: { plan?: unknown; consent?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  if ((body.plan !== "monthly" && body.plan !== "lifetime") || body.consent !== true) {
    return Response.json({ error: "請先確認購買須知" }, { status: 400 });
  }
  const saved = await adminDb().from("vip_purchase_consents").insert({
    user_id: user.id,
    plan: body.plan,
    disclosure_version: DISCLOSURE_VERSION,
  });
  if (saved.error) return Response.json({ error: "無法記錄購買同意" }, { status: 503 });
  return Response.json({ recorded: true, disclosureVersion: DISCLOSURE_VERSION });
}
