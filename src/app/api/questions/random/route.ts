import { createClient } from "@supabase/supabase-js";
import { drawFromDatabase } from "@/lib/question-draw";
import { isQuestionId } from "@/lib/seen-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

function seenIdsFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && isQuestionId(id)).slice(0, 4000);
}

export async function POST(request: Request) {
  let body: { seenIds?: unknown; avoidId?: unknown };
  try {
    body = (await request.json()) as { seenIds?: unknown; avoidId?: unknown };
  } catch {
    return Response.json({ error: "抽題請求無法讀取", question: null, resetSeen: false, keepIds: [] }, { status: 400 });
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
  const drawn = await drawFromDatabase(db, {
    seenIds: seenIdsFrom(body.seenIds),
    avoidId,
    userId,
  });
  const status = drawn.error ? 500 : 200;
  return Response.json(
    {
      error: drawn.error ? "題目載入失敗" : "",
      question: drawn.question,
      resetSeen: drawn.resetSeen,
      keepIds: drawn.keepIds,
    },
    { status },
  );
}
