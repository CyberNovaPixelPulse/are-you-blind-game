import type { SupabaseClient } from "@supabase/supabase-js";
import { isLanguageCode } from "@/lib/languages";
import { readStoredOptions } from "@/lib/question-options";
import { isQuestionId } from "@/lib/seen-questions";

export const QUIZ_LANGUAGE = "zh-TW";
export const MIN_LANGUAGE_POOL = 3;

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
  thinLanguage?: boolean;
};

export type BatchDrawResult = {
  error: string;
  questions: DrawnQuestion[];
  resetSeen: boolean;
  keepIds: string[];
  thinLanguage?: boolean;
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

function toDrawn(row: RawQuestion): DrawnQuestion {
  return {
    id: row.id,
    crop_image_path: row.crop_image_path,
    original_image_path: row.original_image_path,
    author_name: row.author_name,
    options: row.options,
  };
}

function takeOne(rows: RawQuestion[], used: Set<string>) {
  return sample(rows.filter((row) => !used.has(row.id)));
}

export function pickQuestions(
  rows: RawQuestion[],
  seenIds: string[],
  answeredIds: string[],
  avoidId: string | undefined,
  reservedIds: string[],
  count: number,
): BatchDrawResult {
  const limit = Math.min(5, Math.max(1, Math.floor(count)));
  const playableRows = playable(rows);
  const seen = new Set(seenIds.filter(isQuestionId));
  const reserved = new Set(reservedIds.filter(isQuestionId));
  const answered = new Set(answeredIds.filter(isQuestionId));
  let resetSeen = false;
  let keepIds: string[] = [];
  let pool = playableRows.filter((row) => !seen.has(row.id) && !reserved.has(row.id));

  if (pool.length === 0 && playableRows.length > 0 && (seen.size > 0 || reserved.size > 0)) {
    const outsideQueue = playableRows.filter((row) => !reserved.has(row.id));
    if (outsideQueue.length === 0) {
      return { error: "", questions: [], resetSeen: false, keepIds: [] };
    }
    resetSeen = true;
    keepIds = avoidId && outsideQueue.some((row) => row.id === avoidId) ? [avoidId] : [];
    pool = outsideQueue.filter((row) => !keepIds.includes(row.id));
    if (pool.length === 0) {
      keepIds = [];
      pool = outsideQueue;
    }
  }

  if (avoidId && pool.length > 1) {
    const withoutCurrent = pool.filter((row) => row.id !== avoidId);
    if (withoutCurrent.length > 0) pool = withoutCurrent;
  }

  const fresh = pool.filter((row) => !answered.has(row.id));
  const used = new Set<string>();
  const picked: RawQuestion[] = [];
  while (picked.length < limit) {
    const next = takeOne(fresh, used) ?? (fresh.length < pool.length ? takeOne(pool, used) : null);
    if (!next) break;
    used.add(next.id);
    picked.push(next);
  }

  return {
    error: "",
    questions: picked.map(toDrawn),
    resetSeen,
    keepIds,
  };
}

export function pickQuestion(
  rows: RawQuestion[],
  seenIds: string[],
  answeredIds: string[],
  avoidId?: string,
): DrawResult {
  const batch = pickQuestions(rows, seenIds, answeredIds, avoidId, [], 1);
  return {
    error: batch.error,
    question: batch.questions[0] ?? null,
    resetSeen: batch.resetSeen,
    keepIds: batch.keepIds,
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

function mergeRows(base: RawQuestion[], extra: RawQuestion[]) {
  const seen = new Set(base.map((row) => row.id));
  const merged = [...base];
  for (const row of extra) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

async function loadQuestions(db: SupabaseClient, language: string | null) {
  const run = (columns: string) => {
    let query = db.from("questions").select(columns).eq("status", "active");
    if (language) query = query.eq("language", language);
    return query.limit(1000);
  };
  const scored = await run(QUESTION_COLUMNS);
  if (scored.error && missingColumn(scored.error.message)) {
    const plain = await run(QUESTION_COLUMNS_PLAIN);
    return {
      error: plain.error?.message ?? "",
      rows: (plain.data ?? []) as unknown as RawQuestion[],
    };
  }
  return {
    error: scored.error?.message ?? "",
    rows: (scored.data ?? []) as unknown as RawQuestion[],
  };
}

async function loadPlayablePool(db: SupabaseClient, language: string) {
  const primary = await loadQuestions(db, language);
  if (primary.error) return { error: primary.error, rows: [] as RawQuestion[], thinLanguage: false };
  if (primary.rows.length >= MIN_LANGUAGE_POOL) {
    return { error: "", rows: primary.rows, thinLanguage: false };
  }

  let rows = primary.rows;
  const fallbacks = ["en", "zh-TW"].filter((code) => code !== language);
  for (const code of fallbacks) {
    const more = await loadQuestions(db, code);
    if (more.error) continue;
    rows = mergeRows(rows, more.rows);
    if (rows.length >= MIN_LANGUAGE_POOL) break;
  }
  if (rows.length < MIN_LANGUAGE_POOL) {
    const any = await loadQuestions(db, null);
    if (!any.error) rows = mergeRows(rows, any.rows);
  }
  return { error: "", rows, thinLanguage: true };
}

export async function drawManyFromDatabase(
  db: SupabaseClient,
  input: {
    seenIds: string[];
    reservedIds?: string[];
    avoidId?: string;
    userId?: string | null;
    count?: number;
    language?: string | null;
  },
): Promise<BatchDrawResult> {
  const language = isLanguageCode(input.language ?? "") ? input.language! : QUIZ_LANGUAGE;
  const loaded = await loadPlayablePool(db, language);
  if (loaded.error) return { error: loaded.error, questions: [], resetSeen: false, keepIds: [] };
  const answeredIds = input.userId ? await loadAnsweredIds(db, input.userId) : [];
  const picked = pickQuestions(
    loaded.rows,
    input.seenIds,
    answeredIds,
    input.avoidId,
    input.reservedIds ?? [],
    input.count ?? 1,
  );
  return { ...picked, thinLanguage: loaded.thinLanguage };
}

export async function drawFromDatabase(
  db: SupabaseClient,
  input: { seenIds: string[]; avoidId?: string; userId?: string | null; language?: string | null },
): Promise<DrawResult> {
  const batch = await drawManyFromDatabase(db, { ...input, count: 1 });
  return {
    error: batch.error,
    question: batch.questions[0] ?? null,
    resetSeen: batch.resetSeen,
    keepIds: batch.keepIds,
    thinLanguage: batch.thinLanguage,
  };
}
