import OpenAI from "openai";

type Distractor = {
  text: string;
  taunt: string;
};

type ScoreSlice = {
  score: number;
  max: number;
  detail: string;
};

type ScoreBreakdown = {
  blind_guess: ScoreSlice & { guesses: string[]; level: string };
  visual_richness: ScoreSlice;
  distractor_deception: ScoreSlice;
  safety: ScoreSlice & { violated: boolean };
  ai_guesses: string[];
  suggestion: string;
};

type ModerationReason = {
  code: string;
  title: string;
  detail: string;
};

type ModerationResult = {
  passed: boolean;
  quality_score: number;
  score_breakdown: ScoreBreakdown;
  guesses: string[];
  reasons: ModerationReason[];
  suggestion: string;
};

const BLIND_PROMPT = `你在玩局部猜謎，只能看這張裁切特寫，沒有人告訴你答案。
請依序給出 3 個最可能的物件名稱，每個都是簡短名詞，後面的猜測要和前面不同。
若畫面是純色塊、沒有任何可辨識輪廓或材質，featureless 設為 true。
只回傳 JSON：{"featureless":false,"guesses":["猜測1","猜測2","猜測3"]}`;

const SCORE_PROMPT = `你是局部猜謎的綜合審題員。使用者會給裁切特寫、事先完成的 3 次盲猜、正解，以及 3 個干擾項和吐槽。
盲猜是在看到正解之前做出的，請照單全收，不要改寫。

blind_level 只能是：
exact：第 1 或第 2 個盲猜與正解是同一個東西，同義詞、簡稱、常見別名都算命中。
late_exact：只有第 3 個盲猜命中正解。
category：三次之內猜中同一個大類，但沒有直接命中名稱。
association：名稱猜偏，但從顏色、形狀或材質來看聯想合理。
none：完全無關。若 featureless 為 true，必須是 none。

visual_score 是 0 到 25 的整數。依紋理、輪廓邊緣與畫質打分；清晰且特徵豐富給 25，極度模糊或純色給 0 到 5。
distractor_score 是 0 到 20 的整數。3 個干擾項必須和正解同一個上位類別，句型也要對稱；跨類別或隨意聯想要大幅扣分。吐槽要一句話、40 字以內，並點出該干擾項和正解的關鍵差異。空泛、沒點出差異，或吐槽超過 40 字，就扣分。
safety_violated 只有在色情、血腥暴力，或身分證、護照、信用卡等個資證件時才是 true。
各 detail 與 suggestion 用繁體中文，一句話。沒有需要改進時 suggestion 可以是空字串。
只回傳 JSON：
{"blind_level":"category","blind_detail":"盲猜摸到大類，但沒點出名稱。","visual_score":18,"visual_detail":"看得到邊緣與材質。","distractor_score":12,"distractor_detail":"干擾項有一部分像畫面。","safety_violated":false,"safety_detail":"沒有敏感內容。","suggestion":"把裁切再帶一點可辨識的紋理。"}`;

const MAX_IMAGE_BYTES = 150 * 1024;
const STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:crop|original)\.(?:webp|jpe?g|png)$/i;

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

function clampInt(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function readDistractors(value: unknown, correctAnswer: string): Distractor[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parsed: Distractor[] = [];
  const seen = new Set<string>([correctAnswer.toLowerCase()]);
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const text = (item as { text?: unknown }).text;
    const taunt = (item as { taunt?: unknown }).taunt;
    if (typeof text !== "string" || typeof taunt !== "string") return null;
    const trimmedText = text.trim();
    const trimmedTaunt = taunt.trim();
    const key = trimmedText.toLowerCase();
    if (
      trimmedText.length < 1 ||
      trimmedText.length > 120 ||
      trimmedTaunt.length < 1 ||
      trimmedTaunt.length > 280 ||
      seen.has(key)
    ) {
      return null;
    }
    seen.add(key);
    parsed.push({ text: trimmedText, taunt: trimmedTaunt });
  }
  return parsed;
}

function readGuesses(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const featureless = (value as { featureless?: unknown }).featureless;
  const guesses = (value as { guesses?: unknown }).guesses;
  if (typeof featureless !== "boolean" || !Array.isArray(guesses)) return null;
  const parsed = guesses
    .filter((item): item is string => typeof item === "string")
    .map((item) => clip(item, 40))
    .filter(Boolean)
    .slice(0, 3);
  if (featureless) {
    while (parsed.length < 3) parsed.push("看不出來");
    return { featureless, guesses: parsed };
  }
  if (parsed.length !== 3) return null;
  return { featureless, guesses: parsed };
}

function blindPoints(level: string, featureless: boolean) {
  if (featureless || level === "none") return 0;
  if (level === "exact") return 40;
  if (level === "late_exact" || level === "category") return 25;
  if (level === "association") return 10;
  return null;
}

function readScore(value: unknown, featureless: boolean, guesses: string[], distractors: Distractor[]) {
  if (!value || typeof value !== "object") return null;
  const level = (value as { blind_level?: unknown }).blind_level;
  const blindDetail = (value as { blind_detail?: unknown }).blind_detail;
  const visualScore = clampInt((value as { visual_score?: unknown }).visual_score, 0, 25);
  const visualDetail = (value as { visual_detail?: unknown }).visual_detail;
  const distractorScore = clampInt((value as { distractor_score?: unknown }).distractor_score, 0, 20);
  const distractorDetail = (value as { distractor_detail?: unknown }).distractor_detail;
  const violated = (value as { safety_violated?: unknown }).safety_violated;
  const safetyDetail = (value as { safety_detail?: unknown }).safety_detail;
  const suggestion = (value as { suggestion?: unknown }).suggestion;
  const levels = ["exact", "late_exact", "category", "association", "none"];
  if (typeof level !== "string" || !levels.includes(level)) return null;
  if (typeof violated !== "boolean") return null;
  if (visualScore === null || distractorScore === null) return null;
  if (typeof blindDetail !== "string" || typeof visualDetail !== "string") return null;
  if (typeof distractorDetail !== "string" || typeof safetyDetail !== "string") return null;
  if (suggestion !== undefined && typeof suggestion !== "string") return null;

  const blindScore = blindPoints(featureless ? "none" : level, featureless);
  if (blindScore === null) return null;
  const visual = featureless ? Math.min(visualScore, 5) : visualScore;
  const longTaunt = distractors.some((item) => item.taunt.length > 40);
  const deception = longTaunt ? Math.min(distractorScore, 10) : distractorScore;
  const safetyScore = violated ? 0 : 15;
  const qualityScore = violated ? 0 : blindScore + visual + deception + safetyScore;
  const suggestionText = clip(typeof suggestion === "string" ? suggestion : "", 180);
  const breakdown: ScoreBreakdown = {
    blind_guess: {
      score: blindScore,
      max: 40,
      guesses,
      level: featureless ? "none" : level,
      detail: clip(blindDetail, 160),
    },
    visual_richness: { score: visual, max: 25, detail: clip(visualDetail, 160) },
    distractor_deception: { score: deception, max: 20, detail: clip(distractorDetail, 160) },
    safety: { score: safetyScore, max: 15, violated, detail: clip(safetyDetail, 160) },
    ai_guesses: guesses,
    suggestion: suggestionText,
  };
  const reasons: ModerationReason[] = [];
  if (violated) {
    reasons.push({ code: "SAFETY", title: "安全合規", detail: breakdown.safety.detail });
  }
  if (blindScore <= 10) {
    reasons.push({ code: "BLIND_GUESS", title: "盲猜測驗", detail: breakdown.blind_guess.detail });
  }
  if (visual <= 5) {
    reasons.push({ code: "VISUAL", title: "視覺特徵", detail: breakdown.visual_richness.detail });
  }
  if (deception < 12) {
    reasons.push({
      code: "DISTRACTOR",
      title: "干擾項欺騙性",
      detail: breakdown.distractor_deception.detail,
    });
  }
  if (qualityScore < 60 && reasons.length === 0) {
    reasons.push({
      code: "TOTAL",
      title: "綜合分數不足",
      detail: `目前 ${qualityScore} 分，發布需要 60 分以上。`,
    });
  }
  const passed = !violated && qualityScore >= 60;
  return {
    passed,
    quality_score: qualityScore,
    score_breakdown: breakdown,
    guesses,
    reasons: passed ? [] : reasons,
    suggestion: passed ? "" : suggestionText,
  } satisfies ModerationResult;
}

function mimeFromDataUrl(value: string) {
  const match = /^data:(image\/(?:webp|png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  return { mime, base64: match[2].replace(/\s/g, "") };
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return null;
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) return null;
  return { bytes, base64: normalized };
}

async function imageFromPath(imagePath: string) {
  const dataUrl = mimeFromDataUrl(imagePath);
  if (dataUrl) {
    const decoded = decodeBase64(dataUrl.base64);
    if (!decoded) return null;
    return { mime: dataUrl.mime, base64: decoded.base64 };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return null;

  let objectPath = "";
  if (STORAGE_PATH.test(imagePath)) {
    objectPath = imagePath;
  } else {
    let url: URL;
    try {
      url = new URL(imagePath);
    } catch {
      return null;
    }
    const allowed = new URL(supabaseUrl);
    const prefix = "/storage/v1/object/public/quiz-images/";
    if (url.origin !== allowed.origin || !url.pathname.startsWith(prefix)) return null;
    objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!STORAGE_PATH.test(objectPath)) return null;
  }

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/public/quiz-images/${objectPath}`,
  );
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) return null;
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const mime = type === "image/webp" || type === "image/png" || type === "image/jpeg" ? type : "image/webp";
  return { mime, base64: Buffer.from(bytes).toString("base64") };
}

async function readImage(body: {
  imageBase64?: unknown;
  mimeType?: unknown;
  imagePath?: unknown;
}) {
  if (typeof body.imageBase64 === "string" && body.imageBase64.trim()) {
    const raw = body.imageBase64.trim();
    const embedded = mimeFromDataUrl(raw);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
    const mime = embedded
      ? embedded.mime
      : mimeType === "image/jpg"
        ? "image/jpeg"
        : mimeType;
    if (mime !== "image/webp" && mime !== "image/png" && mime !== "image/jpeg") return null;
    const decoded = decodeBase64(embedded ? embedded.base64 : raw);
    if (!decoded) return null;
    return { mime, base64: decoded.base64 };
  }
  if (typeof body.imagePath === "string" && body.imagePath.trim()) {
    return imageFromPath(body.imagePath.trim());
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ message: "尚未設定 OPENAI_API_KEY" }, { status: 500 });
  }

  let correctAnswer = "";
  let distractors: Distractor[] | null = null;
  let image: { mime: string; base64: string } | null = null;
  try {
    const body = (await request.json()) as {
      correctAnswer?: unknown;
      distractors?: unknown;
      imageBase64?: unknown;
      mimeType?: unknown;
      imagePath?: unknown;
    };
    correctAnswer = typeof body.correctAnswer === "string" ? body.correctAnswer.trim() : "";
    distractors = readDistractors(body.distractors, correctAnswer);
    image = await readImage(body);
  } catch {
    return Response.json({ message: "請提供特寫圖片、正解與干擾項" }, { status: 400 });
  }

  if (correctAnswer.length < 1 || correctAnswer.length > 120) {
    return Response.json({ message: "正解名稱需要 1 到 120 個字" }, { status: 400 });
  }
  if (!distractors) {
    return Response.json({ message: "請提供 3 個不重複的干擾項與吐槽" }, { status: 400 });
  }
  if (!image) {
    return Response.json(
      { message: "請提供 150KB 以內的 WebP、PNG 或 JPEG 特寫" },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const imagePart = {
      type: "image_url" as const,
      image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: "high" as const },
    };
    const blindCompletion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: BLIND_PROMPT },
        { role: "user", content: [{ type: "text", text: "請只看圖猜 3 次，只回傳 JSON。" }, imagePart] },
      ],
    });
    const blindContent = blindCompletion.choices[0]?.message?.content;
    const blind = blindContent ? readGuesses(readModelJson(blindContent)) : null;
    if (!blind) {
      console.error("moderate-quiz blind invalid", (blindContent ?? "").slice(0, 500));
      return Response.json({ message: "盲猜沒有回傳可用結果" }, { status: 502 });
    }

    const distractorText = distractors
      .map((item, index) => `${index + 1}. ${item.text}（吐槽 ${item.taunt.length} 字：${item.taunt}）`)
      .join("\n");
    const scoreCompletion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SCORE_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `featureless：${blind.featureless}\n盲猜：${blind.guesses.join("、")}\n正解：${correctAnswer}\n干擾項：\n${distractorText}\n請只回傳 JSON。`,
            },
            imagePart,
          ],
        },
      ],
    });
    const scoreContent = scoreCompletion.choices[0]?.message?.content;
    const result = scoreContent
      ? readScore(readModelJson(scoreContent), blind.featureless, blind.guesses, distractors)
      : null;
    if (!result) {
      console.error("moderate-quiz score invalid", (scoreContent ?? "").slice(0, 500));
      return Response.json({ message: "預審回傳的格式不正確" }, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    const message = describeError(error);
    console.error("moderate-quiz", message);
    return Response.json({ message }, { status: 500 });
  }
}
