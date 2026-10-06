import type { SupabaseClient } from "@supabase/supabase-js";
import { readStoredOptions } from "@/lib/question-options";
import { isQuestionId } from "@/lib/seen-questions";

export const QUIZ_LANGUAGE = "zh-TW";

const QUESTION_COLUMNS =
  "id, crop_image_path, original_image_path, author_name, options, quality_score";
const QUESTION_COLUMNS_PLAIN =
  "id, crop_image_path, original_image_path, author_name, options";
const QUALITY_NUDGE = 0.2;

export type DrawnQuestion = {
  id: string;
  crop_image_path: string;
  original_image_path: string;
  author_name: string;
  options: unknown;
};

type RawQuestion = DrawnQuestion & {
  quality_score?: unknown;
};

export type DrawResult = {
  error: string;
  question: DrawnQuestion | null;
  resetSeen: boolean;
  keepIds: string[];
};

function missingColumn(message: string) {
  const text = message.toLowerCase();
  return text.includes("column") || text.includes("schema cache") || text.includes("could not find");
}

function qualityOf(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

function playable(rows: RawQuestion[]) {
  return rows.filter((row) => {
    if (!isQuestionId(row.id)) return false;
    const options = readStoredOptions(row.options);
    return options.length > 0 && options.some((option) => option.isCorrect);
  });
}

function sample(rows: RawQuestion[]) {
  let best = rows[0] ?? null;
  let bestKey = -Infinity;
  for (const row of rows) {
    const key = Math.random() + (qualityOf(row.quality_score) / 100) * QUALITY_NUDGE;
    if (key > bestKey) {
      best = row;
      bestKey = key;
    }
  }
  return best;
}

export function pickQuestion(
  rows: RawQuestion[],
  seenIds: string[],
  answeredIds: string[],
  avoidId?: string,
): DrawResult {
  const playableRows = playable(rows);
  const seen = new Set(seenIds.filter(isQuestionId));
  const answered = new Set(answeredIds.filter(isQuestionId));
  let resetSeen = false;
  let keepIds: string[] = [];
  let pool = playableRows.filter((row) => !seen.has(row.id));

  if (pool.length === 0 && seen.size > 0 && playableRows.length > 0) {
    resetSeen = true;
    keepIds = avoidId && playableRows.some((row) => row.id === avoidId) ? [avoidId] : [];
    pool = playableRows.filter((row) => !keepIds.includes(row.id));
    if (pool.length === 0) {
      keepIds = [];
      pool = playableRows;
    }
  }

  if (avoidId && pool.length > 1) {
    const withoutCurrent = pool.filter((row) => row.id !== avoidId);
    if (withoutCurrent.length > 0) pool = withoutCurrent;
  }

  const unseenAnswers = pool.filter((row) => !answered.has(row.id));
  const candidates = unseenAnswers.length > 0 ? unseenAnswers : pool;
  const picked = sample(candidates);
  if (!picked) {
    return { error: "", question: null, resetSeen, keepIds };
  }

  return {
    error: "",
    question: {
      id: picked.id,
      crop_image_path: picked.crop_image_path,
      original_image_path: picked.original_image_path,
      author_name: picked.author_name,
      options: picked.options,
    },
    resetSeen,
    keepIds,
  };
}

async function loadAnsweredIds(db: SupabaseClient, userId: string) {
  const history = await db
    .from("user_question_answers")
    .select("question_id")
    .eq("user_id", userId)
    .limit(4000);
  if (history.error) return [];
  return (history.data ?? [])
    .map((row) => row.question_id)
    .filter((id): id is string => typeof id === "string" && isQuestionId(id));
}

async function loadQuestions(db: SupabaseClient) {
  const scored = await db
    .from("questions")
    .select(QUESTION_COLUMNS)
    .eq("status", "active")
    .eq("language", QUIZ_LANGUAGE)
    .limit(1000);
  if (scored.error && missingColumn(scored.error.message)) {
    const plain = await db
      .from("questions")
      .select(QUESTION_COLUMNS_PLAIN)
      .eq("status", "active")
      .eq("language", QUIZ_LANGUAGE)
      .limit(1000);
    return {
      error: plain.error?.message ?? "",
      rows: (plain.data ?? []) as RawQuestion[],
    };
  }
  return {
    error: scored.error?.message ?? "",
    rows: (scored.data ?? []) as RawQuestion[],
  };
}

export async function drawFromDatabase(
  db: SupabaseClient,
  input: { seenIds: string[]; avoidId?: string; userId?: string | null },
): Promise<DrawResult> {
  const loaded = await loadQuestions(db);
  if (loaded.error) return { error: loaded.error, question: null, resetSeen: false, keepIds: [] };
  const answeredIds = input.userId ? await loadAnsweredIds(db, input.userId) : [];
  return pickQuestion(loaded.rows, input.seenIds, answeredIds, input.avoidId);
}
