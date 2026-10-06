import { drawFromDatabase, type DrawResult } from "@/lib/question-draw";
import { readSeenIds, rememberSeen, writeSeenIds } from "@/lib/seen-questions";
import { supabase } from "@/lib/supabase";

export type { DrawResult, DrawnQuestion } from "@/lib/question-draw";

function readPayload(value: unknown): DrawResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    error?: unknown;
    question?: unknown;
    resetSeen?: unknown;
    keepIds?: unknown;
  };
  const question = row.question;
  if (question !== null && (typeof question !== "object" || !question)) return null;
  const drawn = question as {
    id?: unknown;
    crop_image_path?: unknown;
    original_image_path?: unknown;
    author_name?: unknown;
    options?: unknown;
  } | null;
  if (
    drawn &&
    (typeof drawn.id !== "string" ||
      typeof drawn.crop_image_path !== "string" ||
      typeof drawn.original_image_path !== "string" ||
      typeof drawn.author_name !== "string")
  ) {
    return null;
  }
  const keepIds = Array.isArray(row.keepIds)
    ? row.keepIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    error: typeof row.error === "string" ? row.error : "",
    question: drawn
      ? {
          id: drawn.id as string,
          crop_image_path: drawn.crop_image_path as string,
          original_image_path: drawn.original_image_path as string,
          author_name: drawn.author_name as string,
          options: drawn.options,
        }
      : null,
    resetSeen: row.resetSeen === true,
    keepIds,
  };
}

export async function drawQuestion(avoidId?: string): Promise<DrawResult> {
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
      body: JSON.stringify({ seenIds, avoidId: avoidId ?? null }),
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
