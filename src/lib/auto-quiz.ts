import OpenAI from "openai";
import sharp from "sharp";
import type { AdminQuestion } from "@/app/admin/types";
import type { QuizOption } from "@/lib/question-options";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 150 * 1024;
const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OBJECTS = [
  { category: "日常生活用品", name: "牙刷刷毛", prompt: "toothbrush bristles" },
  { category: "日常生活用品", name: "鈕扣縫眼", prompt: "a clothes button and its sewing holes" },
  { category: "日常生活用品", name: "鑰匙齒", prompt: "the teeth of a metal key" },
  { category: "日常生活用品", name: "充電線接頭", prompt: "a charging cable connector" },
  { category: "日常生活用品", name: "眼鏡鉸鏈", prompt: "an eyeglasses hinge" },
  { category: "日常生活用品", name: "膠帶切面", prompt: "the cut edge of a roll of tape" },
  { category: "日常生活用品", name: "遙控器按鈕", prompt: "a remote control button" },
  { category: "日常生活用品", name: "衣架勾", prompt: "a clothes hanger hook" },
  { category: "日常生活用品", name: "口罩耳帶", prompt: "a face-mask ear loop" },
  { category: "日常生活用品", name: "雨傘骨架", prompt: "umbrella ribs" },
  { category: "日常生活用品", name: "拖鞋鞋底", prompt: "a slipper sole tread" },
  { category: "日常生活用品", name: "梳子齒", prompt: "comb teeth" },
  { category: "廚房餐具", name: "竹筷尖端", prompt: "the tip of bamboo chopsticks" },
  { category: "廚房餐具", name: "湯匙勺面", prompt: "a stainless soup spoon bowl" },
  { category: "廚房餐具", name: "鑄鐵鍋緣", prompt: "the rim of a cast-iron pan" },
  { category: "廚房餐具", name: "砧板刀痕", prompt: "knife scars on a cutting board" },
  { category: "廚房餐具", name: "濾茶網孔", prompt: "a tea strainer mesh" },
  { category: "廚房餐具", name: "瓦斯爐架", prompt: "a gas stove grate" },
  { category: "廚房餐具", name: "刨絲器孔", prompt: "a cheese grater hole" },
  { category: "廚房餐具", name: "陶瓷碗緣", prompt: "the lip of a ceramic bowl" },
  { category: "廚房餐具", name: "蒸籠竹編", prompt: "a bamboo steamer weave" },
  { category: "廚房餐具", name: "菜刀刃口", prompt: "a kitchen knife edge" },
  { category: "廚房餐具", name: "電鍋內鍋", prompt: "the inside of a rice-cooker inner pot" },
  { category: "廚房餐具", name: "量杯刻度", prompt: "measuring cup markings" },
  { category: "古董機械", name: "齒輪咬合", prompt: "meshing metal gears" },
  { category: "古董機械", name: "發條旋鈕", prompt: "a clockwork winding crown" },
  { category: "古董機械", name: "打字機字鍵", prompt: "a vintage typewriter typebar" },
  { category: "古董機械", name: "懷錶機芯", prompt: "a pocket-watch movement" },
  { category: "古董機械", name: "縫紉機針", prompt: "a sewing machine needle and plate" },
  { category: "古董機械", name: "留聲機唱針", prompt: "a gramophone needle" },
  { category: "古董機械", name: "黃銅羅盤", prompt: "a brass compass" },
  { category: "古董機械", name: "相機快門", prompt: "a vintage camera shutter" },
  { category: "古董機械", name: "算盤珠", prompt: "abacus beads on rods" },
  { category: "古董機械", name: "電話撥盤", prompt: "a rotary telephone dial" },
  { category: "古董機械", name: "擒縱輪", prompt: "a clock escapement wheel" },
  { category: "古董機械", name: "油燈燈芯", prompt: "an oil lamp wick" },
  { category: "樂器配件", name: "吉他弦枕", prompt: "a guitar nut and strings" },
  { category: "樂器配件", name: "鋼琴槌氈", prompt: "a piano hammer felt" },
  { category: "樂器配件", name: "小提琴琴橋", prompt: "a violin bridge" },
  { category: "樂器配件", name: "薩克斯鍵墊", prompt: "a saxophone key pad" },
  { category: "樂器配件", name: "鼓皮紋理", prompt: "a drumhead surface" },
  { category: "樂器配件", name: "笛子吹口", prompt: "a flute embouchure hole" },
  { category: "樂器配件", name: "吉他撥片", prompt: "a guitar pick" },
  { category: "樂器配件", name: "銅鈸邊緣", prompt: "the edge of a cymbal" },
  { category: "樂器配件", name: "口琴簧片", prompt: "a harmonica reed" },
  { category: "樂器配件", name: "二胡琴筒", prompt: "an erhu soundbox skin" },
  { category: "樂器配件", name: "小提琴腮托", prompt: "a violin chin rest" },
  { category: "樂器配件", name: "鼓棒尖端", prompt: "the tip of a drumstick" },
  { category: "文具工具", name: "鉛筆芯尖", prompt: "a sharpened pencil lead tip" },
  { category: "文具工具", name: "鋼筆筆尖", prompt: "a fountain pen nib" },
  { category: "文具工具", name: "橡皮擦屑", prompt: "eraser crumbs" },
  { category: "文具工具", name: "釘書針", prompt: "a stapler staple" },
  { category: "文具工具", name: "尺的刻度", prompt: "ruler tick marks" },
  { category: "文具工具", name: "修正帶口", prompt: "a correction-tape dispenser tip" },
  { category: "文具工具", name: "美工刀刃", prompt: "a snap-off utility knife blade" },
  { category: "文具工具", name: "蠟筆剖面", prompt: "a broken crayon cross-section" },
  { category: "文具工具", name: "圖釘針帽", prompt: "a thumbtack head" },
  { category: "文具工具", name: "剪刀刃口", prompt: "scissors blades" },
  { category: "文具工具", name: "螢光筆頭", prompt: "a highlighter tip" },
  { category: "文具工具", name: "筆記本線", prompt: "notebook ruling lines" },
  { category: "交通工具局部", name: "輪胎胎紋", prompt: "a tire tread" },
  { category: "交通工具局部", name: "機車握把", prompt: "a motorcycle grip" },
  { category: "交通工具局部", name: "腳踏車鏈條", prompt: "a bicycle chain" },
  { category: "交通工具局部", name: "方向燈殼", prompt: "a turn-signal lens" },
  { category: "交通工具局部", name: "車門把手", prompt: "a car door handle" },
  { category: "交通工具局部", name: "煞車碟盤", prompt: "a brake disc" },
  { category: "交通工具局部", name: "雨刷橡膠", prompt: "a windshield wiper blade" },
  { category: "交通工具局部", name: "排氣管口", prompt: "an exhaust pipe tip" },
  { category: "交通工具局部", name: "安全帽風孔", prompt: "a helmet vent" },
  { category: "交通工具局部", name: "輪圈幅條", prompt: "wheel spokes" },
  { category: "交通工具局部", name: "車燈反光杯", prompt: "a headlight reflector" },
  { category: "交通工具局部", name: "車窗膠條", prompt: "a window weather seal" },
  { category: "建築材質", name: "清水混凝土", prompt: "exposed concrete with air pockets" },
  { category: "建築材質", name: "紅磚斷面", prompt: "a broken red brick" },
  { category: "建築材質", name: "磁磚釉面", prompt: "glazed wall tile" },
  { category: "建築材質", name: "木地板接縫", prompt: "a wood floor seam" },
  { category: "建築材質", name: "水泥牆裂紋", prompt: "a crack in a cement wall" },
  { category: "建築材質", name: "磨石子", prompt: "terrazzo aggregate" },
  { category: "建築材質", name: "鐵皮浪板", prompt: "corrugated metal siding" },
  { category: "建築材質", name: "大理石紋", prompt: "marble veining" },
  { category: "建築材質", name: "屋瓦邊緣", prompt: "a roof tile edge" },
  { category: "建築材質", name: "油漆剝落", prompt: "peeling paint on a wall" },
  { category: "建築材質", name: "玻璃磚", prompt: "a glass block" },
  { category: "建築材質", name: "鋼筋斷面", prompt: "a cut reinforcing steel bar" },
  { category: "奇特動植物紋理", name: "蜂巢孔洞", prompt: "honeycomb cells" },
  { category: "奇特動植物紋理", name: "龜殼盾片", prompt: "turtle shell scutes" },
  { category: "奇特動植物紋理", name: "松果鱗片", prompt: "pinecone scales" },
  { category: "奇特動植物紋理", name: "仙人掌刺", prompt: "cactus spines" },
  { category: "奇特動植物紋理", name: "葉脈網絡", prompt: "a leaf vein network" },
  { category: "奇特動植物紋理", name: "蘑菇菌褶", prompt: "mushroom gills" },
  { category: "奇特動植物紋理", name: "羽毛羽枝", prompt: "feather barbs" },
  { category: "奇特動植物紋理", name: "樹皮裂紋", prompt: "tree bark fissures" },
  { category: "奇特動植物紋理", name: "魚鱗排列", prompt: "fish scales" },
  { category: "奇特動植物紋理", name: "珊瑚孔洞", prompt: "coral pores" },
  { category: "奇特動植物紋理", name: "苔蘚叢", prompt: "a clump of moss" },
  { category: "奇特動植物紋理", name: "蜥蜴鱗片", prompt: "lizard scales" },
] as const;

const MATERIALS = [
  { name: "磨砂金屬", prompt: "frosted metal" },
  { name: "老舊木紋", prompt: "aged wood grain" },
  { name: "半透明塑料", prompt: "translucent plastic" },
  { name: "編織毛線", prompt: "knitted yarn" },
  { name: "微距水滴", prompt: "macro water droplets clinging to the surface" },
  { name: "皮革縫線", prompt: "leather with visible stitching" },
  { name: "氧化銅綠", prompt: "verdigris oxidized copper" },
  { name: "搪瓷剝落", prompt: "chipped enamel" },
  { name: "拉絲不鏽鋼", prompt: "brushed stainless steel" },
  { name: "生鏽鐵皮", prompt: "rusty sheet iron" },
  { name: "磨砂玻璃", prompt: "frosted glass" },
  { name: "亞麻纖維", prompt: "coarse linen fiber" },
  { name: "陶瓷開片", prompt: "crackle-glazed ceramic" },
  { name: "軟木顆粒", prompt: "cork granules" },
  { name: "碳纖維編織", prompt: "carbon-fiber weave" },
  { name: "珍珠母貝", prompt: "mother-of-pearl" },
] as const;

const ANGLES = [
  { name: "45 度斜切微距", prompt: "a 45-degree macro angle" },
  { name: "正上方俯視微距", prompt: "a straight top-down macro angle" },
  { name: "側面掠光", prompt: "raking side light skimming the surface" },
  { name: "逆光邊緣", prompt: "backlit edges with the center partly in shadow" },
  { name: "極近中心對焦", prompt: "an extreme close-up focused only on the center" },
  { name: "貼地低角度", prompt: "a low angle almost touching the surface" },
  { name: "對角線構圖", prompt: "a diagonal macro composition" },
  { name: "淺景深高點", prompt: "shallow depth of field locked on the highest texture point" },
  { name: "環形光均勻", prompt: "even ring-light illumination" },
  { name: "斜逆光顆粒", prompt: "oblique backlight that reveals every grain" },
] as const;

type IdeaObject = (typeof OBJECTS)[number];
type IdeaMaterial = (typeof MATERIALS)[number];
type IdeaAngle = (typeof ANGLES)[number];

type Idea = {
  key: string;
  object: IdeaObject;
  material: IdeaMaterial;
  angle: IdeaAngle;
};

const QUIZ_PROMPT = `你在看一張局部特寫，要為猜謎遊戲出題。先客觀辨識畫面裡實際看得到的形狀、輪廓與材質，再決定名稱。不要腦補畫面外的東西。
用繁體中文，只回傳 JSON，不要 markdown。
features 是 40 字以內的客觀特徵，不寫答案。
correct_answer 是這張特寫最精準的物件名稱，8 字以內。
correct_taunt 與 options 裡的 3 句 taunt 都是犀利毒舌吐槽，總共剛好 4 句。每句 40 字以內，一句話，尖銳但不人身攻擊。
options 剛好 3 個干擾項。每個 text 必須和正解屬於同一上位類別，視覺輪廓相似，實際物品卻完全不同。
正解若是某電器，干擾項就必須是外型相近的其他電器；正解若是餐具、樂器、文具或交通零件，干擾項也必須留在同一個維度。
不可跨類別，例如不可把「紅燈籠」放進眼睛題，也不可把「拖把」放進尾巴題。
每個 text 8 字以內，四個名稱彼此不可重複。
每句吐槽都要點出該選項和正解在可見特徵上的差異。
quality_score 是 0 到 100 的整數：特寫仍猜得出來給 60 以上，紋理清楚且干擾項夠像給 80 以上，幾乎沒有特徵或答案含糊就低於 40。
difficulty 固定為 normal。
格式：
{"features":"形狀與材質","correct_answer":"名稱","correct_taunt":"吐槽","options":[{"text":"干擾1","taunt":"吐槽1"},{"text":"干擾2","taunt":"吐槽2"},{"text":"干擾3","taunt":"吐槽3"}],"quality_score":88,"difficulty":"normal"}`;

type GeneratedQuiz = {
  answer: string;
  correctTaunt: string;
  options: { text: string; taunt: string }[];
  qualityScore: number;
  features: string;
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
    features?: unknown;
    correct_answer?: unknown;
    correct_taunt?: unknown;
    options?: unknown;
    quality_score?: unknown;
  };
  if (typeof row.correct_answer !== "string" || typeof row.correct_taunt !== "string") return null;
  if (!Array.isArray(row.options)) return null;
  const answer = clip(row.correct_answer, 8);
  const correctTaunt = clip(row.correct_taunt, 40);
  const features = clip(typeof row.features === "string" ? row.features : "", 40);
  if (!answer || !correctTaunt) return null;
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
  return { answer, correctTaunt, options, qualityScore, features };
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function ideaKey(objectName: string, materialName: string, angleName: string) {
  return `${objectName}|${materialName}|${angleName}`;
}

function pickIdea(usedKeys: Set<string>, usedObjects: Set<string>): Idea {
  const fresh = OBJECTS.filter((item) => !usedObjects.has(item.name));
  const objectPool = fresh.length > 0 ? fresh : OBJECTS;
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const object = pickOne(objectPool);
    const material = pickOne(MATERIALS);
    const angle = pickOne(ANGLES);
    const key = ideaKey(object.name, material.name, angle.name);
    if (usedKeys.has(key)) continue;
    return { key, object, material, angle };
  }
  const object = pickOne(OBJECTS);
  const material = pickOne(MATERIALS);
  const angle = pickOne(ANGLES);
  return { key: ideaKey(object.name, material.name, angle.name), object, material, angle };
}

async function loadUsedThemes(db: ReturnType<typeof adminDb>) {
  const usedKeys = new Set<string>();
  const usedObjects = new Set<string>();
  const listed = await db
    .from("questions")
    .select("options, score_breakdown")
    .eq("author_name", "AI 出題")
    .order("created_at", { ascending: false })
    .limit(500);
  if (listed.error || !listed.data) return { usedKeys, usedObjects };
  for (const row of listed.data) {
    const breakdown = row.score_breakdown;
    if (breakdown && typeof breakdown === "object") {
      const record = breakdown as { idea_key?: unknown; object?: unknown };
      if (typeof record.idea_key === "string") usedKeys.add(record.idea_key);
      if (typeof record.object === "string") usedObjects.add(record.object);
    }
    if (!Array.isArray(row.options)) continue;
    for (const option of row.options) {
      if (!option || typeof option !== "object") continue;
      const item = option as { text?: unknown; is_correct?: unknown };
      if (item.is_correct === true && typeof item.text === "string" && item.text.trim()) {
        usedObjects.add(item.text.trim());
      }
    }
  }
  return { usedKeys, usedObjects };
}

function imagePrompt(idea: Idea) {
  return `Photorealistic square macro photograph of ${idea.object.prompt}. The surface is ${idea.material.prompt}. Camera: ${idea.angle.prompt}. Rich everyday texture, natural light, no text, no watermark, no logo, no collage, no people's faces.`;
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

async function askQuiz(client: OpenAI, crop: Buffer, idea: Idea) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: QUIZ_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `預定類別：${idea.object.category}。預定物品：${idea.object.name}。先只根據特寫裡看得到的形狀與材質出題。只回傳 JSON。`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/webp;base64,${crop.toString("base64")}`,
              detail: "high",
            },
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
  const db = adminDb();
  const used = await loadUsedThemes(db);
  const idea = pickIdea(used.usedKeys, used.usedObjects);
  let originalPng: Buffer;
  try {
    const generated = await client.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt(idea),
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
      quiz = await askQuiz(client, cropWebp, idea);
    } catch (error) {
      console.error("auto-generate quiz", redact(error));
      if (attempt === 1) throw new Error("看圖出題失敗，請再試一次");
    }
  }
  if (!quiz) throw new Error("題目格式不正確，請再試一次");

  const questionId = crypto.randomUUID();
  const cropPath = `${authorId}/${questionId}/crop.webp`;
  const originalPath = `${authorId}/${questionId}/original.webp`;
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
    { id: 1, text: quiz.answer, is_correct: true, taunt: quiz.correctTaunt },
    ...quiz.options.map((option, index) => ({
      id: index + 2,
      text: option.text,
      is_correct: false,
      taunt: option.taunt,
    })),
  ];

  const scoreBreakdown = {
    source: "ai-auto",
    suggestion: "",
    idea_key: idea.key,
    category: idea.object.category,
    object: idea.object.name,
    material: idea.material.name,
    angle: idea.angle.name,
    features: quiz.features,
  };
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
      score_breakdown: scoreBreakdown,
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
    hideReason: null,
    difficulty: "normal",
    language: "zh-TW",
    options,
    reports: [],
    solvabilityScore: 8,
    category: idea.object.category,
    qualityScore: quiz.qualityScore,
    scoreBreakdown,
  };
}
