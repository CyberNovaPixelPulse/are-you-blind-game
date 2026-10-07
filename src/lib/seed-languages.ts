import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { SEED_SUBJECTS, lexiconQuiz, type SeedLine, type SeedSubject } from "@/lib/seed-lexicon";

const SEED_AUTHOR_NAME = "Global Seed";
const PER_LANGUAGE = SEED_SUBJECTS.length;

const SUBJECT_IMAGES: Record<SeedSubject, { crop: string; original: string; hint: string }> = {
  apple: {
    crop: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=720&h=720&q=80",
    original: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=1400&q=80",
    hint: "a pile of red apples",
  },
  cat: {
    crop: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=720&h=720&q=80",
    original: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1400&q=80",
    hint: "a black and white house cat",
  },
  keyboard: {
    crop: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=720&h=720&q=80",
    original: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=1400&q=80",
    hint: "a computer keyboard on a desk",
  },
  spoon: {
    crop: "https://images.unsplash.com/photo-1577563717655-919fc57789b4?auto=format&fit=crop&w=720&h=720&q=80",
    original: "https://images.unsplash.com/photo-1577563717655-919fc57789b4?auto=format&fit=crop&w=1400&q=80",
    hint: "a metal spoon holding red spice powder",
  },
};

export type SeedSummary = {
  generator: "gemini" | "lexicon" | "mixed";
  authorId: string;
  inserted: number;
  skipped: string[];
  failed: { language: string; message: string }[];
};

type ReadyQuiz = {
  subject: SeedSubject;
  line: SeedLine;
};

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return [...text].slice(0, max).join("");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readModelJson(raw: string): unknown {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("[");
  const end = withoutFence.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("Gemini 回傳裡沒有 JSON 陣列");
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function readLine(value: unknown): SeedLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { answer?: unknown; taunt?: unknown; options?: unknown };
  if (typeof row.answer !== "string" || typeof row.taunt !== "string" || !Array.isArray(row.options)) return null;
  if (row.options.length !== 3) return null;
  const wrong: string[] = [];
  const bites: string[] = [];
  for (const option of row.options) {
    if (!option || typeof option !== "object") return null;
    const item = option as { text?: unknown; taunt?: unknown };
    if (typeof item.text !== "string" || typeof item.taunt !== "string") return null;
    wrong.push(clip(item.text, 40));
    bites.push(clip(item.taunt, 160));
  }
  const answer = clip(row.answer, 40);
  const taunt = clip(row.taunt, 160);
  if (!answer || !taunt || wrong.some((text) => !text) || bites.some((text) => !text)) return null;
  const names = [answer, ...wrong];
  if (new Set(names).size !== names.length) return null;
  return { answer, taunt, wrong: [wrong[0], wrong[1], wrong[2]], bites: [bites[0], bites[1], bites[2]] };
}

function fallbackPack(language: LanguageCode): ReadyQuiz[] {
  return SEED_SUBJECTS.map((subject) => ({ subject, line: lexiconQuiz(language, subject) }));
}

async function askGemini(language: LanguageCode): Promise<ReadyQuiz[]> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("缺少 GEMINI_API_KEY");
  const info = LANGUAGES.find((item) => item.code === language);
  const ai = new GoogleGenAI({ apiKey: key });
  const subjects = SEED_SUBJECTS.map((subject) => `${subject}: ${SUBJECT_IMAGES[subject].hint}`).join("\n");
  const prompt = `You write multiple-choice quiz copy for a close-up photo guessing game.
Target language code: ${language}
Language name: ${info?.nativeName ?? language}
Write EVERY answer, distractor, and taunt in that language only.
Subjects:
${subjects}
For each subject return the precise object name, one smug taunt for the correct answer, and exactly 3 distractors from the same everyday category with their own taunts.
Distractors must be visually confusable but different objects. Taunts are one sharp sentence, no slurs, no personal attacks.
Return only a JSON array:
[{"id":"apple","answer":"...","taunt":"...","options":[{"text":"...","taunt":"..."},{"text":"...","taunt":"..."},{"text":"...","taunt":"..."}]}]`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", temperature: 0.6 },
  });
  const parsed = readModelJson(response.text ?? "");
  if (!Array.isArray(parsed)) throw new Error("Gemini JSON 不是陣列");
  const byId = new Map<string, SeedLine>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !SEED_SUBJECTS.includes(id as SeedSubject)) continue;
    const line = readLine(item);
    if (line) byId.set(id, line);
  }
  if (byId.size !== SEED_SUBJECTS.length) throw new Error("Gemini 題目不完整");
  return SEED_SUBJECTS.map((subject) => ({ subject, line: byId.get(subject)! }));
}

function storedOptions(line: SeedLine) {
  return [
    { id: 1, text: line.answer, is_correct: true, taunt: line.taunt },
    ...line.wrong.map((text, index) => ({
      id: index + 2,
      text,
      is_correct: false,
      taunt: line.bites[index] ?? line.taunt,
    })),
  ];
}

async function resolveAuthorId(db: SupabaseClient) {
  const configured = process.env.SEED_AUTHOR_ID?.trim();
  if (configured) return configured;
  const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  const id = listed.data.users[0]?.id;
  if (!id) throw new Error("找不到出題作者。請先註冊一個帳號，或設定 SEED_AUTHOR_ID。");
  return id;
}

async function existingSubjects(db: SupabaseClient, language: LanguageCode) {
  const loaded = await db
    .from("questions")
    .select("score_breakdown")
    .eq("language", language)
    .eq("author_name", SEED_AUTHOR_NAME)
    .limit(20);
  if (loaded.error) throw new Error(loaded.error.message);
  const subjects = new Set<SeedSubject>();
  for (const row of loaded.data ?? []) {
    const breakdown = row.score_breakdown;
    if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) continue;
    const subject = (breakdown as { subject?: unknown }).subject;
    if (typeof subject === "string" && SEED_SUBJECTS.includes(subject as SeedSubject)) {
      subjects.add(subject as SeedSubject);
    }
  }
  return subjects;
}

async function insertQuiz(
  db: SupabaseClient,
  authorId: string,
  language: LanguageCode,
  quiz: ReadyQuiz,
) {
  const image = SUBJECT_IMAGES[quiz.subject];
  const payload = {
    id: crypto.randomUUID(),
    crop_image_path: image.crop,
    original_image_path: image.original,
    author_id: authorId,
    author_name: SEED_AUTHOR_NAME,
    difficulty: "normal",
    status: "active",
    language,
    country_code: "GLOBAL",
    quality_score: 72,
    score_breakdown: { source: "seed-30", subject: quiz.subject, generator: "seed" },
    options: storedOptions(quiz.line),
  };
  const inserted = await db.from("questions").insert(payload);
  if (!inserted.error) return;
  const message = inserted.error.message.toLowerCase();
  if (message.includes("country_code")) {
    const retryPayload: Record<string, unknown> = { ...payload };
    delete retryPayload.country_code;
    const retry = await db.from("questions").insert(retryPayload);
    if (!retry.error) return;
    throw new Error(retry.error.message);
  }
  if (message.includes("questions_image_path_chk") || message.includes("webp")) {
    throw new Error("圖片網址被資料庫拒絕。請先執行 supabase/migrations/20261007102000_questions_country_and_remote_images.sql");
  }
  throw new Error(inserted.error.message);
}

export async function seedThirtyLanguages(): Promise<SeedSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("需要 NEXT_PUBLIC_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authorId = await resolveAuthorId(db);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  let usedGemini = false;
  let usedLexicon = false;
  const summary: SeedSummary = { generator: "lexicon", authorId, inserted: 0, skipped: [], failed: [] };

  for (const language of LANGUAGES) {
    try {
      const have = await existingSubjects(db, language.code);
      if (have.size >= 3) {
        summary.skipped.push(language.code);
        continue;
      }
      let pack: ReadyQuiz[];
      if (hasGemini) {
        try {
          pack = await askGemini(language.code);
          usedGemini = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`${language.code} Gemini 失敗，改用內建題庫：${message}`);
          pack = fallbackPack(language.code);
          usedLexicon = true;
        }
        await sleep(350);
      } else {
        pack = fallbackPack(language.code);
        usedLexicon = true;
      }
      for (const quiz of pack) {
        if (have.has(quiz.subject)) continue;
        await insertQuiz(db, authorId, language.code, quiz);
        summary.inserted += 1;
      }
      console.log(`${language.code} 已寫入`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed.push({ language: language.code, message });
      console.error(`${language.code} 失敗：${message}`);
    }
  }

  summary.generator = usedGemini && usedLexicon ? "mixed" : usedGemini ? "gemini" : "lexicon";
  if (!hasGemini) {
    console.warn("未設定 GEMINI_API_KEY，30 語題庫使用內建母語文案。");
  }
  console.log(`完成：新增 ${summary.inserted} 題，略過 ${summary.skipped.length} 語，失敗 ${summary.failed.length} 語。`);
  return summary;
}

export const SEED_QUESTION_COUNT = PER_LANGUAGE;
