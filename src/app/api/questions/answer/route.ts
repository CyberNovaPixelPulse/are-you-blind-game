import { createHash } from "node:crypto";
import { isQuestionId } from "@/lib/seen-questions";
import { readJsonLimited } from "@/lib/api-protection";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasServiceRole()) return Response.json({ error: "答題服務尚未設定" }, { status: 503 });
  const body = await readJsonLimited<{ questionId?: unknown; optionId?: unknown }>(request, 500);
  if (
    !body || typeof body.questionId !== "string" || !isQuestionId(body.questionId) ||
    (typeof body.optionId !== "string" && typeof body.optionId !== "number")
  ) return Response.json({ error: "答案資料無效" }, { status: 400 });

  const address = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const requesterKey = createHash("sha256").update(`question-answer:${address}`).digest("hex");
  const db = adminDb();
  const rate = await db.rpc("consume_api_rate_limit", {
    p_key: requesterKey, p_window_seconds: 60, p_limit: 120,
  });
  if (rate.error) return Response.json({ error: "答題服務暫時無法使用" }, { status: 503 });
  if (rate.data !== true) return Response.json({ error: "答題次數過多，請稍後再試" }, { status: 429 });

  const [question, key] = await Promise.all([
    db.from("questions").select("options").eq("id", body.questionId).eq("status", "active").maybeSingle(),
    db.from("question_answer_keys").select("correct_option_id, correct_answer, original_image_path")
      .eq("question_id", body.questionId).maybeSingle(),
  ]);
  if (question.error) return Response.json({ error: "答題服務暫時無法使用" }, { status: 503 });
  if (!question.data || !Array.isArray(question.data.options)) {
    return Response.json({ error: "題目不存在" }, { status: 404 });
  }
  const options = question.data.options as { id?: unknown; text?: unknown; is_correct?: unknown; taunt?: unknown }[];
  const missingAnswerTable = key.error?.code === "42P01" || key.error?.code === "PGRST205";
  if (key.error && !missingAnswerTable) return Response.json({ error: "答題服務暫時無法使用" }, { status: 503 });
  const legacyCorrect = options.find((value) => value.is_correct === true);
  const correctOptionId = key.data?.correct_option_id ?? (legacyCorrect ? String(legacyCorrect.id) : "");
  const answerText = key.data?.correct_answer ?? (typeof legacyCorrect?.text === "string" ? legacyCorrect.text : "");
  const option = question.data.options.find((value: unknown) =>
    value && typeof value === "object" && String((value as { id?: unknown }).id) === String(body.optionId),
  ) as { id?: unknown; taunt?: unknown } | undefined;
  if (!option) return Response.json({ error: "這個選項不屬於題目" }, { status: 400 });

  let originalImageUrl = "";
  if (key.data?.original_image_path) {
    const path = key.data.original_image_path;
    if (/^https:\/\//i.test(path)) {
      originalImageUrl = path;
    } else {
      const signed = await db.storage.from("quiz-originals").createSignedUrl(path, 300);
      if (!signed.error) originalImageUrl = signed.data.signedUrl;
    }
  }

  return Response.json({
    isCorrect: Boolean(correctOptionId) && String(option.id) === correctOptionId,
    tauntText: typeof option.taunt === "string" ? option.taunt : "",
    answerText,
    originalImageUrl,
  }, { headers: { "Cache-Control": "no-store" } });
}
