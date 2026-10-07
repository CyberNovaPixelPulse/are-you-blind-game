import OpenAI from "openai";
import { isLanguageCode, languageByCode, type LanguageCode } from "@/lib/languages";

type GeneratedOption = {
  text: string;
  taunt: string;
};

type GeneratedPayload = {
  correctTaunt: string;
  options: GeneratedOption[];
};

const SYSTEM_PROMPT = `你是毒舌、幽默且愛看迷因的台灣社群鄉民，說話極度犀利、有梗，完全拋棄任何官方客套話。
使用者會給你一道局部猜謎的正解名稱。請依這個正解動態產生內容，不要回固定範例。
產出 3 個視覺上容易看錯的干擾選項。text 嚴格 8 字以內。

干擾選項強約束：
同類別同維度。干擾項必須和正解屬於完全相同的上位概念與類別，嚴格禁止跨物種或隨意聯想。
若正解是「川普的眼睛」，干擾項必須是其他同領域名人的眼睛，例如「拜登的眼睛」「毛澤東的眼睛」「馬斯克的眼睛」，絕不可出現「紅燈籠」或「水滴眼」。
若正解是特定品種狗的部位，例如「柴犬尾巴」，干擾項必須是其他犬種的同一部位，例如「秋田犬尾巴」「柯基尾巴」，不可出現「拖把」或「狐狸」。
語法結構對稱。3 個干擾項的句型必須和正解相同，例如正解是「某某的眼睛」，三個干擾項也都是「某某的眼睛」。字數盡量接近正解，且每個都在 8 字以內。
三個干擾項不可與正解相同，也不可彼此重複。

嘲諷詞連動。taunt 是玩家選到這個錯誤答案時跳出的話。對象是選錯的玩家，多用「你」。
每句 taunt 必須精準點出「這一個干擾項」和正解的關鍵差異，不可三句共用同一句空泛嘲諷。
例如選了「毛澤東的眼睛」，可以寫：「年代跟膚色差這麼多也能搞混，你是政治盲還是近視一千度？」
taunt 嚴格 40 字以內（含標點），一句話講完。
correctTaunt 要給選對的玩家一句出人意料的浮誇讚美，嚴格 20 字以內（含標點），一句話講完。
只回傳 JSON，不要 markdown，格式如下：
{"correctTaunt":"浮誇讚美","options":[{"text":"干擾詞1","taunt":"吐槽1"},{"text":"干擾詞2","taunt":"吐槽2"},{"text":"干擾詞3","taunt":"吐槽3"}]}`;

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function describeError(error: unknown) {
  let text = error instanceof Error ? error.message : String(error);
  const key = process.env.OPENAI_API_KEY;
  if (key) text = text.replaceAll(key, "[key]");
  text = text.replace(/sk-[A-Za-z0-9_-]+/g, "[key]").replace(/\s+/g, " ").slice(0, 500);
  return `OpenAI 呼叫失敗：${text}`;
}

function readModelJson(raw: string): unknown {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("AI 回傳裡沒有 JSON");
  }
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function limitsFor(language: LanguageCode) {
  if (language === "zh-TW" || language === "zh-CN") {
    return { text: 8, taunt: 40, praise: 20 };
  }
  return { text: 48, taunt: 160, praise: 80 };
}

function promptFor(language: LanguageCode) {
  const info = languageByCode(language);
  const limits = limitsFor(language);
  return `${SYSTEM_PROMPT}

Write correctTaunt, every option text, and every taunt only in ${info.nativeName} (${info.code}).
These limits replace the character limits above: option text at most ${limits.text} characters, each taunt at most ${limits.taunt} characters, correctTaunt at most ${limits.praise} characters.`;
}

const MAX_AI_IMAGE_BYTES = 400 * 1024;

type AiImage = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

function readAiImage(value: unknown): AiImage | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dataUrl = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
  const payload = (dataUrl ? dataUrl[2] : trimmed).replace(/\s/g, "");
  if (payload.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return null;
  }
  if (bytes.length < 16 || bytes.length > MAX_AI_IMAGE_BYTES) return null;

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp =
    bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (isJpeg) return { mime: "image/jpeg", base64: payload };
  if (isPng) return { mime: "image/png", base64: payload };
  if (isWebp) return { mime: "image/webp", base64: payload };
  return null;
}

function userContent(correctAnswer: string, language: LanguageCode, image: AiImage | null) {
  const text = `正解名稱：${correctAnswer}\n目標語言：${languageByCode(language).nativeName} (${language})\n請依這個正解產出 3 個同類別、同句型的干擾項，而且 correctTaunt、text、taunt 全部只用這個語言。每句 taunt 都要點出該干擾項和正解的關鍵差異，並嘲諷選了它的玩家。另外給一句正解誇獎。只回傳 JSON。`;
  if (!image) return text;
  return [
    {
      type: "text" as const,
      text: `${text}\n附圖是這題的局部裁切。干擾項要維持和正解相同類別與句型，並優先選看起來容易和這張圖搞混的名稱。`,
    },
    {
      type: "image_url" as const,
      image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: "low" as const },
    },
  ];
}

async function askModel(
  client: OpenAI,
  correctAnswer: string,
  language: LanguageCode,
  image: AiImage | null,
) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.9,
    messages: [
      { role: "system", content: promptFor(language) },
      { role: "user", content: userContent(correctAnswer, language, image) },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  return readPayload(readModelJson(content), correctAnswer, language);
}

function readPayload(value: unknown, correctAnswer: string, language: LanguageCode): GeneratedPayload | null {
  if (!value || typeof value !== "object") return null;
  const praise = (value as { correctTaunt?: unknown }).correctTaunt;
  const options = (value as { options?: unknown }).options;
  if (typeof praise !== "string" || !Array.isArray(options)) return null;

  const limits = limitsFor(language);
  const correctTaunt = clip(praise, limits.praise);
  if (!correctTaunt) return null;

  const parsed: GeneratedOption[] = [];
  const seen = new Set<string>([correctAnswer.toLowerCase()]);
  for (const item of options) {
    if (!item || typeof item !== "object") continue;
    const text = (item as { text?: unknown }).text;
    const taunt = (item as { taunt?: unknown }).taunt;
    if (typeof text !== "string" || typeof taunt !== "string") continue;
    const trimmedText = clip(text, limits.text);
    const trimmedTaunt = clip(taunt, limits.taunt);
    const key = trimmedText.toLowerCase();
    if (!trimmedText || !trimmedTaunt || seen.has(key)) continue;
    seen.add(key);
    parsed.push({ text: trimmedText, taunt: trimmedTaunt });
    if (parsed.length === 3) break;
  }
  if (parsed.length !== 3) return null;
  return { correctTaunt, options: parsed };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ message: "尚未設定 OPENAI_API_KEY" }, { status: 500 });
  }

  let correctAnswer = "";
  let language: LanguageCode = "zh-TW";
  let image: AiImage | null = null;
  try {
    const body = (await request.json()) as {
      correctAnswer?: unknown;
      language?: unknown;
      imageBase64?: unknown;
    };
    correctAnswer = typeof body.correctAnswer === "string" ? body.correctAnswer.trim() : "";
    if (typeof body.language === "string" && isLanguageCode(body.language)) {
      language = body.language;
    }
    image = readAiImage(body.imageBase64);
  } catch {
    return Response.json({ message: "請提供正解名稱" }, { status: 400 });
  }
  if (correctAnswer.length < 1 || correctAnswer.length > 120) {
    return Response.json({ message: "正解名稱需要 1 到 120 個字" }, { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey });
    let generated: GeneratedPayload | null = null;
    if (image) {
      try {
        generated = await askModel(client, correctAnswer, language, image);
      } catch (error) {
        console.error("ai-options image fallback", describeError(error));
      }
    }
    if (!generated) {
      generated = await askModel(client, correctAnswer, language, null);
    }
    if (!generated) {
      return Response.json({ message: "AI 回傳的格式不正確" }, { status: 502 });
    }
    return Response.json(generated);
  } catch (error) {
    const message = describeError(error);
    console.error("ai-options", message);
    return Response.json({ message }, { status: 500 });
  }
}
