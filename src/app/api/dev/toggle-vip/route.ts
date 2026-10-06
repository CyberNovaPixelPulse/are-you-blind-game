import { createClient } from "@supabase/supabase-js";
import { assertLocalDev } from "@/lib/admin-access";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

export async function POST(request: Request) {
  await assertLocalDev();

  if (!hasServiceRole()) {
    return Response.json(
      { error: "這台環境不能直接改 VIP。請到 Supabase 的 profiles 把 is_vip 設成 true。" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) {
    return Response.json({ error: "請先登入再切換測試 VIP。" }, { status: 401 });
  }

  const authClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "請先登入再切換測試 VIP。" }, { status: 401 });
  }

  const db = adminDb();
  const current = await db.from("profiles").select("is_vip").eq("id", userData.user.id).maybeSingle();
  if (current.error || !current.data) {
    return Response.json({ error: "讀不到個人資料，請稍後再試。" }, { status: 400 });
  }

  const nextVip = current.data.is_vip !== true;
  const updated = await db
    .from("profiles")
    .update({ is_vip: nextVip })
    .eq("id", userData.user.id)
    .select("is_vip")
    .single();
  if (updated.error || !updated.data) {
    return Response.json({ error: "切換失敗，請到 Supabase 的 profiles 修改 is_vip。" }, { status: 500 });
  }

  return Response.json({ is_vip: updated.data.is_vip === true });
}
