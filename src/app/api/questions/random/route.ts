import { createClient } from "@supabase/supabase-js";
import { drawManyFromDatabase } from "@/lib/question-draw";
import { isQuestionId } from "@/lib/seen-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

function seenIdsFrom(value: unknown, limit = 4000) {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && isQuestionId(id)).slice(0, limit);
}

function batchCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) return 1;
  return Math.min(5, Math.max(1, value));
}

export async function POST(request: Request) {
  let body: { seenIds?: unknown; reservedIds?: unknown; avoidId?: unknown; count?: unknown };
  try {
    body = (await request.json()) as { seenIds?: unknown; reservedIds?: unknown; avoidId?: unknown; count?: unknown };
  } catch {
    return Response.json(
      { error: "抽題請求無法讀取", question: null, questions: [], resetSeen: false, keepIds: [] },
      { status: 400 },
    );
  }

  const authorization = request.headers.get("authorization");
  const db = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      global: authorization ? { headers: { Authorization: authorization } } : undefined,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );

  let userId: string | null = null;
  if (authorization) {
    const user = await db.auth.getUser();
    userId = user.data.user?.id ?? null;
  }

  const avoidId = typeof body.avoidId === "string" && isQuestionId(body.avoidId) ? body.avoidId : undefined;
  const drawn = await drawManyFromDatabase(db, {
    seenIds: seenIdsFrom(body.seenIds),
    reservedIds: seenIdsFrom(body.reservedIds, 20),
    avoidId,
    userId,
    count: batchCount(body.count),
  });
  const status = drawn.error ? 500 : 200;
  return Response.json(
    {
      error: drawn.error ? "題目載入失敗" : "",
      question: drawn.questions[0] ?? null,
      questions: drawn.questions,
      resetSeen: drawn.resetSeen,
      keepIds: drawn.keepIds,
    },
    { status },
  );
}
