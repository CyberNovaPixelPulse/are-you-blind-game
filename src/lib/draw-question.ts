import { drawFromDatabase, drawManyFromDatabase, type BatchDrawResult, type DrawResult, type DrawnQuestion } from "@/lib/question-draw";
import { isQuestionId, readSeenIds, rememberSeen, writeSeenIds } from "@/lib/seen-questions";
import { supabase } from "@/lib/supabase";

export type { BatchDrawResult, DrawResult, DrawnQuestion } from "@/lib/question-draw";

function readPayload(value: unknown): DrawResult | null {
  const batch = readBatchPayload(value);
  if (!batch) return null;
  return {
    error: batch.error,
    question: batch.questions[0] ?? null,
    resetSeen: batch.resetSeen,
    keepIds: batch.keepIds,
    thinLanguage: batch.thinLanguage,
  };
}

function readQuestion(value: unknown): DrawnQuestion | null {
  if (!value || typeof value !== "object") return null;
  const drawn = value as {
    id?: unknown;
    crop_image_path?: unknown;
    original_image_path?: unknown;
    author_name?: unknown;
    options?: unknown;
  };
  if (
    typeof drawn.id !== "string" ||
    typeof drawn.crop_image_path !== "string" ||
    typeof drawn.original_image_path !== "string" ||
    typeof drawn.author_name !== "string"
  ) {
    return null;
  }
  return {
    id: drawn.id,
    crop_image_path: drawn.crop_image_path,
    original_image_path: drawn.original_image_path,
    author_name: drawn.author_name,
    options: drawn.options,
  };
}

function readBatchPayload(value: unknown): BatchDrawResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    error?: unknown;
    question?: unknown;
    questions?: unknown;
    resetSeen?: unknown;
    keepIds?: unknown;
    thinLanguage?: unknown;
  };
  const listed = Array.isArray(row.questions) ? row.questions.map(readQuestion).filter((item) => item !== null) : [];
  const single = readQuestion(row.question);
  const questions = listed.length > 0 ? listed : single ? [single] : [];
  const keepIds = Array.isArray(row.keepIds)
    ? row.keepIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    error: typeof row.error === "string" ? row.error : "",
    questions,
    resetSeen: row.resetSeen === true,
    keepIds,
    thinLanguage: row.thinLanguage === true,
  };
}

export async function drawQuestions(
  count = 5,
  avoidId?: string,
  reservedIds: string[] = [],
  language?: string,
): Promise<BatchDrawResult> {
  const seenIds = readSeenIds();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const reserved = reservedIds.filter(isQuestionId);
  try {
    const response = await fetch("/api/questions/random", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        seenIds,
        reservedIds: reserved,
        avoidId: avoidId ?? null,
        count,
        language: language ?? null,
      }),
    });
    if (response.ok) {
      const payload = readBatchPayload(await response.json());
      if (payload) return payload;
    }
  } catch {
    // 批次抽題連不上時，改由瀏覽器直接向 Supabase 一次取回這一池。
  }

  return drawManyFromDatabase(supabase, {
    seenIds,
    reservedIds: reserved,
    avoidId,
    userId: session.data.session?.user?.id ?? null,
    count,
    language,
  });
}

export async function drawQuestion(avoidId?: string, language?: string): Promise<DrawResult> {
  const seenIds = readSeenIds();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  try {
    const response = await fetch("/api/questions/random", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ seenIds, avoidId: avoidId ?? null, language: language ?? null }),
    });
    if (response.ok) {
      const payload = readPayload(await response.json());
      if (payload) return payload;
    }
  } catch {
    // 抽題 API 暫時連不上時，改由瀏覽器直接向 Supabase 抽題。
  }

  return drawFromDatabase(supabase, {
    seenIds,
    avoidId,
    userId: session.data.session?.user?.id ?? null,
    language,
  });
}

export function commitDraw(result: DrawResult) {
  if (result.resetSeen) writeSeenIds(result.keepIds);
  if (result.question) rememberSeen(result.question.id);
}

export async function recordAnsweredQuestion(questionId: string) {
  rememberSeen(questionId);
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user?.id;
  if (!userId) return;
  await supabase.from("user_question_answers").insert({
    user_id: userId,
    question_id: questionId,
  });
}
