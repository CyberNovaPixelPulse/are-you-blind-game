import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";
import { isLanguageCode } from "@/lib/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Answer = { questionId: string; optionId: string; elapsedMs: number };
type StoredOption = { id: string | number; is_correct?: boolean };

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function authorizedClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function POST(request: Request) {
  if (!hasServiceRole()) return Response.json({ error: "排行榜暫時無法儲存" }, { status: 503 });
  let body: { action?: unknown; mode?: unknown; language?: unknown; runId?: unknown; challengeDate?: unknown; answers?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const db = adminDb();
  if (body.action === "start") {
    const source = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = createHash("sha256").update(`challenge-start:${source}`).digest("hex");
    const rate = await db.rpc("consume_api_rate_limit", { p_key: key, p_window_seconds: 60, p_limit: 12 });
    if (rate.error) return Response.json({ error: "挑戰服務暫時無法使用" }, { status: 503 });
    if (rate.data !== true) return Response.json({ error: "開始次數太多，請稍後再試" }, { status: 429 });
    const mode = body.mode === "daily" ? "daily" : "endless";
    const language = typeof body.language === "string" && isLanguageCode(body.language) ? body.language : "zh-TW";
    const challengeDate = mode === "daily" ? todayInTaipei() : null;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    let userId: string | null = null;
    if (token) {
      const auth = authorizedClient(token);
      if (!auth) return Response.json({ error: "登入服務尚未設定" }, { status: 503 });
      const { data: { user }, error } = await auth.auth.getUser();
      if (error || !user) return Response.json({ error: "登入狀態已失效" }, { status: 401 });
      userId = user.id;
    }
    const created = await db.from("challenge_runs").insert({ mode, challenge_date: challengeDate, language, user_id: userId }).select("id").single();
    if (created.error || !created.data) return Response.json({ error: "無法開始挑戰" }, { status: 503 });
    return Response.json({ runId: created.data.id, challengeDate });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const auth = token ? authorizedClient(token) : null;
  if (!auth) return Response.json({ error: "請先登入" }, { status: 401 });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return Response.json({ error: "登入狀態已失效" }, { status: 401 });

  if (body.action !== "finish" || typeof body.runId !== "string" || !Array.isArray(body.answers) || body.answers.length > 500) {
    return Response.json({ error: "挑戰結算資料無效" }, { status: 400 });
  }
  const answers: Answer[] = [];
  for (const item of body.answers) {
    if (!item || typeof item !== "object") return Response.json({ error: "答案資料無效" }, { status: 400 });
    const row = item as Record<string, unknown>;
    if (
      typeof row.questionId !== "string" ||
      typeof row.optionId !== "string" ||
      typeof row.elapsedMs !== "number" ||
      !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0 || row.elapsedMs > 10_000
    ) return Response.json({ error: "答案資料無效" }, { status: 400 });
    answers.push({ questionId: row.questionId, optionId: row.optionId, elapsedMs: Math.floor(row.elapsedMs) });
  }
  if (new Set(answers.map((answer) => answer.questionId)).size !== answers.length) {
    return Response.json({ error: "同一題不能重複計分" }, { status: 400 });
  }

  const run = await db.from("challenge_runs").select("id, user_id, mode, challenge_date, language, started_at, finished_at").eq("id", body.runId).maybeSingle();
  if (run.error || !run.data || run.data.finished_at) return Response.json({ error: "這局已結算或不存在" }, { status: 409 });
  if (run.data.user_id && run.data.user_id !== user.id) return Response.json({ error: "這局屬於另一個帳號" }, { status: 403 });
  const age = Date.now() - new Date(run.data.started_at).getTime();
  if (age < 0 || age > 24 * 60 * 60 * 1000 || (run.data.mode === "daily" && run.data.challenge_date !== todayInTaipei())) {
    return Response.json({ error: "挑戰已過期" }, { status: 409 });
  }
  const reportedTime = answers.reduce((total, answer) => total + answer.elapsedMs, 0);
  if (answers.length * 200 > age + 500 || reportedTime > age + 1000) {
    return Response.json({ error: "作答時間無效" }, { status: 400 });
  }

  if (run.data.mode === "daily") {
    const daily = await db.rpc("get_daily_challenge_questions", {
      p_date: run.data.challenge_date,
      p_language: run.data.language,
    });
    if (daily.error) return Response.json({ error: "無法驗證每日題組" }, { status: 503 });
    const validIds = new Set((daily.data ?? []).map((question: { id: string }) => question.id));
    if (answers.some((answer) => !validIds.has(answer.questionId))) {
      return Response.json({ error: "答案不屬於今日題組" }, { status: 400 });
    }
  }

  const questionIds = answers.map((answer) => answer.questionId);
  const questions = questionIds.length
    ? await db.from("questions").select("id, options").eq("status", "active").in("id", questionIds)
    : { data: [], error: null };
  if (questions.error) return Response.json({ error: "無法驗證題目" }, { status: 503 });
  const answerKeys = questionIds.length
    ? await db.from("question_answer_keys").select("question_id, correct_option_id").in("question_id", questionIds)
    : { data: [], error: null };
  const answerTableMissing = answerKeys.error?.code === "42P01" || answerKeys.error?.code === "PGRST205";
  if (answerKeys.error && !answerTableMissing) return Response.json({ error: "無法驗證題目" }, { status: 503 });
  const byId = new Map((questions.data ?? []).map((question) => [question.id, question.options as StoredOption[]]));
  const correctOptionByQuestion = answerTableMissing
    ? new Map((questions.data ?? []).flatMap((question) => {
        const correct = (question.options as StoredOption[]).find((option) => option.is_correct === true);
        return correct ? [[question.id, String(correct.id)] as [string, string]] : [];
      }))
    : new Map((answerKeys.data ?? []).map((row) => [row.question_id, row.correct_option_id]));
  let score = 0;
  let streak = 0;
  for (const answer of answers) {
    const options = byId.get(answer.questionId) ?? [];
    const choice = options.find((option) => String(option.id) === answer.optionId);
    if (!choice || correctOptionByQuestion.get(answer.questionId) !== answer.optionId) break;
    streak += 1;
    score += 1000 + Math.floor((10_000 - answer.elapsedMs) * 0.2);
  }

  // Atomic claim prevents two concurrent/replayed submissions for one run.
  const finishedAt = new Date().toISOString();
  let claimQuery = db.from("challenge_runs").update({ finished_at: finishedAt, user_id: user.id })
    .eq("id", body.runId).is("finished_at", null);
  claimQuery = run.data.user_id ? claimQuery.eq("user_id", user.id) : claimQuery.is("user_id", null);
  const claimed = await claimQuery.select("id").maybeSingle();
  if (claimed.error || !claimed.data) return Response.json({ error: "這局已結算" }, { status: 409 });

  const profile = await db.from("profiles").select("username, avatar_url").eq("id", user.id).maybeSingle();
  const metadata = user.user_metadata ?? {};
  const username = String(profile.data?.username || metadata.full_name || metadata.name || user.email?.split("@")[0] || "玩家").trim().slice(0, 40) || "玩家";
  const challengeDate = run.data.mode === "daily" ? run.data.challenge_date : null;
  const saved = await db.from("challenge_leaderboard").insert({
    user_id: user.id,
    username,
    avatar_url: profile.data?.avatar_url ?? null,
    total_score: score,
    streak_count: streak,
    mode: run.data.mode,
    challenge_date: challengeDate,
    run_id: body.runId,
  });
  if (saved.error) {
    await db.from("challenge_runs").update({ finished_at: null }).eq("id", body.runId).eq("user_id", user.id).eq("finished_at", finishedAt);
    return Response.json({ error: "分數儲存失敗，請稍後重試" }, { status: 503 });
  }
  return Response.json({ score, streak, mode: run.data.mode, challengeDate });
}
