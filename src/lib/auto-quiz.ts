import OpenAI from "openai";
import sharp from "sharp";
import type { AdminQuestion } from "@/app/admin/types";
import type { QuizOption } from "@/lib/question-options";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 150 * 1024;
const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBJECTS = [
  "a kitchen sponge with visible pores",
  "a cat's whiskers and short fur",
  "a sliced kiwi cross-section",
  "a woven rattan basket",
  "a single computer keyboard key",
  "a pile of roasted coffee beans",
  "a succulent plant leaf",
  "blue denim fabric weave",
  "a strawberry surface with seeds",
  "the sharpened tip of a wooden pencil",
  "cracked ceramic glaze on a mug",
  "a dog paw pad",
  "a piece of honeycomb",
  "the crumb of a sliced bread loaf",
  "a metal jacket zipper",
  "lemon peel and pulp",
  "a knitted wool sweater",
  "a bicycle tire tread",
  "uncooked instant noodles",
  "a garlic clove with papery skin",
];

const QUIZ_PROMPT = `你在看一張局部特寫，要為猜謎遊戲出題。只根據畫面作答。
用繁體中文，只回傳 JSON，不要 markdown。
correct_answer 是這張特寫最可能的物件名稱，要具體到能找到同種類的兄弟選項，8 字以內。
correct_taunt 是答對時給玩家的浮誇誇獎，20 字以內，一句話。
options 剛好 3 個。每個 text 都要和正解屬於完全相同的上位概念與類別，句型也要對稱。
例如正解是「川普的眼睛」，干擾項就要是其他名人的眼睛，不可寫「紅燈籠」或「水滴眼」。
例如正解是「柴犬尾巴」，干擾項就要是其他犬種的尾巴，不可寫「拖把」或「狐狸」。
每個 text 8 字以內，不可與正解或其他干擾項重複。
每個 taunt 都要嘲諷選了該選項的玩家，並點出這一個干擾項和正解的關鍵差異，40 字以內，一句話。
quality_score 是 0 到 100 的整數：特寫仍猜得出來就給 60 以上，紋理豐富且很好猜給 80 以上。
difficulty 固定為 normal。
格式：
{"correct_answer":"名稱","correct_taunt":"誇獎","options":[{"text":"干擾1","taunt":"吐槽1"},{"text":"干擾2","taunt":"吐槽2"},{"text":"干擾3","taunt":"吐槽3"}],"quality_score":88,"difficulty":"normal"}`;

type GeneratedQuiz = {
  answer: string;
  praise: string;
  options: { text: string; taunt: string }[];
  qualityScore: number;
};

function clip(value: string, max: number) {
  return [...value.trim()].slice(0, max).join("");
}

function redact(error: unknown) {
  let text = error instanceof Error ? error.message : String(error);
  const key = process.env.OPENAI_API_KEY;
  if (key) text = text.replaceAll(key, "[key]");
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[key]").replace(/\s+/g, " ").slice(0, 300);
}

function readModelJson(raw: string): unknown {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI 回傳裡沒有 JSON");
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function readQuiz(value: unknown): GeneratedQuiz | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    correct_answer?: unknown;
    correct_taunt?: unknown;
    options?: unknown;
    quality_score?: unknown;
  };
  if (typeof row.correct_answer !== "string" || typeof row.correct_taunt !== "string") return null;
  if (!Array.isArray(row.options)) return null;
  const answer = clip(row.correct_answer, 8);
  const praise = clip(row.correct_taunt, 20);
  if (!answer || !praise) return null;
  const seen = new Set<string>([answer.toLowerCase()]);
  const options: { text: string; taunt: string }[] = [];
  for (const item of row.options) {
    if (!item || typeof item !== "object") continue;
    const textValue = (item as { text?: unknown }).text;
    const tauntValue = (item as { taunt?: unknown }).taunt;
    if (typeof textValue !== "string" || typeof tauntValue !== "string") continue;
    const text = clip(textValue, 8);
    const taunt = clip(tauntValue, 40);
    const key = text.toLowerCase();
    if (!text || !taunt || seen.has(key)) continue;
    seen.add(key);
    options.push({ text, taunt });
    if (options.length === 3) break;
  }
  if (options.length !== 3) return null;
  const rawScore = typeof row.quality_score === "number" ? row.quality_score : Number(row.quality_score);
  const qualityScore = Number.isFinite(rawScore)
    ? Math.min(100, Math.max(0, Math.round(rawScore)))
    : 80;
  return { answer, praise, options, qualityScore };
}

function imagePrompt(subject: string) {
  return `Photorealistic square photograph of ${subject}. Rich surface texture, natural light, shallow depth of field, everyday real-world detail. No text, no watermark, no logo, no collage, no people's faces.`;
}

async function toWebp(input: Buffer, maxEdge: number) {
  let quality = 78;
  let edge = maxEdge;
  const render = () =>
    sharp(input)
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

  let output = await render();
  while (output.length > MAX_IMAGE_BYTES && quality > 36) {
    quality -= 8;
    output = await render();
  }
  while (output.length > MAX_IMAGE_BYTES && edge > 360) {
    edge = Math.round(edge * 0.8);
    quality = Math.max(quality, 42);
    output = await render();
  }
  if (output.length > MAX_IMAGE_BYTES) {
    throw new Error("圖片必須是 150KB 以內的 WebP");
  }
  const header = output.subarray(0, 12);
  if (header.subarray(0, 4).toString("ascii") !== "RIFF" || header.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new Error("圖片必須是 150KB 以內的 WebP");
  }
  return output;
}

async function cropCloseup(input: Buffer) {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) throw new Error("原圖尺寸不足，無法裁切");
  const ratio = 0.3 + Math.random() * 0.1;
  const side = Math.min(width, height, Math.max(32, Math.round(Math.min(width, height) * ratio)));
  const maxLeft = width - side;
  const maxTop = height - side;
  const left = Math.min(maxLeft, Math.round(maxLeft * (0.15 + Math.random() * 0.7)));
  const top = Math.min(maxTop, Math.round(maxTop * (0.15 + Math.random() * 0.7)));
  return sharp(input).extract({ left, top, width: side, height: side }).toBuffer();
}

async function resolveAuthorId() {
  const db = adminDb();
  const existing = await db.from("questions").select("author_id").limit(1);
  const fromQuestion = existing.data?.[0]?.author_id;
  if (typeof fromQuestion === "string" && QUESTION_ID.test(fromQuestion)) return fromQuestion;
  const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  const userId = listed.data.users[0]?.id;
  if (userId && QUESTION_ID.test(userId)) return userId;
  return null;
}

async function askQuiz(client: OpenAI, crop: Buffer) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: QUIZ_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "看這張特寫出題，只回傳 JSON。" },
          {
            type: "image_url",
            image_url: { url: `data:image/webp;base64,${crop.toString("base64")}` },
          },
        ],
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  return readQuiz(readModelJson(content));
}

function publicImageUrl(path: string) {
  return supabase.storage.from("quiz-images").getPublicUrl(path).data.publicUrl;
}

export async function generateAutoQuiz(): Promise<AdminQuestion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY");
  if (!hasServiceRole()) throw new Error("尚未設定服務金鑰");

  const authorId = await resolveAuthorId();
  if (!authorId) throw new Error("找不到可用的出題帳號");

  const client = new OpenAI({ apiKey });
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)] ?? SUBJECTS[0];
  let originalPng: Buffer;
  try {
    const generated = await client.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt(subject),
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      n: 1,
    });
    const encoded = generated.data?.[0]?.b64_json;
    if (!encoded) throw new Error("原圖沒有生成");
    originalPng = Buffer.from(encoded, "base64");
  } catch (error) {
    console.error("auto-generate image", redact(error));
    throw new Error("原圖生成失敗，請再試一次");
  }

  const cropped = await cropCloseup(originalPng);
  const [originalWebp, cropWebp] = await Promise.all([
    toWebp(originalPng, 1024),
    toWebp(cropped, 768),
  ]);

  let quiz: GeneratedQuiz | null = null;
  for (let attempt = 0; attempt < 2 && !quiz; attempt += 1) {
    try {
      quiz = await askQuiz(client, cropWebp);
    } catch (error) {
      console.error("auto-generate quiz", redact(error));
      if (attempt === 1) throw new Error("看圖出題失敗，請再試一次");
    }
  }
  if (!quiz) throw new Error("題目格式不正確，請再試一次");

  const questionId = crypto.randomUUID();
  const cropPath = `${authorId}/${questionId}/crop.webp`;
  const originalPath = `${authorId}/${questionId}/original.webp`;
  const db = adminDb();
  const uploaded: string[] = [];

  const cropUpload = await db.storage.from("quiz-images").upload(cropPath, cropWebp, {
    contentType: "image/webp",
    upsert: false,
  });
  if (cropUpload.error) throw new Error("特寫上傳失敗");
  uploaded.push(cropPath);

  const originalUpload = await db.storage.from("quiz-images").upload(originalPath, originalWebp, {
    contentType: "image/webp",
    upsert: false,
  });
  if (originalUpload.error) {
    await db.storage.from("quiz-images").remove(uploaded);
    throw new Error("原圖上傳失敗");
  }
  uploaded.push(originalPath);

  const storedOptions = [
    { id: 1, text: quiz.answer, is_correct: true, taunt: quiz.praise },
    ...quiz.options.map((option, index) => ({
      id: index + 2,
      text: option.text,
      is_correct: false,
      taunt: option.taunt,
    })),
  ];

  const inserted = await db
    .from("questions")
    .insert({
      id: questionId,
      crop_image_path: cropPath,
      original_image_path: originalPath,
      author_id: authorId,
      author_name: "AI 出題",
      difficulty: "normal",
      status: "active",
      language: "zh-TW",
      quality_score: quiz.qualityScore,
      score_breakdown: { source: "ai-auto", suggestion: "" },
      options: storedOptions,
    })
    .select("id, created_at")
    .single();

  if (inserted.error || !inserted.data) {
    await db.storage.from("quiz-images").remove(uploaded);
    console.error("auto-generate insert", redact(inserted.error));
    throw new Error("題目寫入失敗，請再試一次");
  }

  const options: QuizOption[] = storedOptions.map((option) => ({
    id: String(option.id),
    text: option.text,
    isCorrect: option.is_correct,
    tauntText: option.taunt,
  }));

  return {
    id: inserted.data.id,
    authorName: "AI 出題",
    createdAt: inserted.data.created_at,
    cropUrl: publicImageUrl(cropPath),
    originalUrl: publicImageUrl(originalPath),
    cropPath,
    originalPath,
    status: "active",
    difficulty: "normal",
    language: "zh-TW",
    options,
    reports: [],
    solvabilityScore: 8,
    category: "未分類",
    qualityScore: quiz.qualityScore,
    scoreBreakdown: { source: "ai-auto", suggestion: "" },
  };
}
