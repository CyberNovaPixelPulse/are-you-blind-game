import { createHash } from "node:crypto";
import { readJsonLimited } from "@/lib/api-protection";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";
import { isQuestionId } from "@/lib/seen-questions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasServiceRole()) return Response.json({ error: "觀看數服務尚未設定" }, { status: 503 });
  const body = await readJsonLimited<{ questionId?: unknown }>(request, 500);
  if (!body) return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  if (typeof body.questionId !== "string" || !isQuestionId(body.questionId)) {
    return Response.json({ error: "題目編號無效" }, { status: 400 });
  }

  const address = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const key = createHash("sha256").update(`question-view:${address}`).digest("hex");
  const db = adminDb();
  const rate = await db.rpc("consume_api_rate_limit", {
    p_key: key, p_window_seconds: 60, p_limit: 120,
  });
  if (rate.error) return Response.json({ error: "觀看數服務暫時無法使用" }, { status: 503 });
  if (rate.data !== true) return Response.json({ error: "請求太多" }, { status: 429 });

  const counted = await db.rpc("increment_question_views", { target_question_id: body.questionId });
  if (counted.error) return Response.json({ error: "觀看數更新失敗" }, { status: 503 });
  return new Response(null, { status: 204 });
}
