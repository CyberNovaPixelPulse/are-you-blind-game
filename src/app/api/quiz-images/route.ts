import { createClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

function contentTypeOf(value: string) {
  const type = value.toLowerCase();
  if (type === "image/jpg" || type === "image/jpeg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  if (type === "image/webp") return "image/webp";
  return "";
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) {
    return Response.json({ message: "請先登入" }, { status: 401 });
  }

  const userClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const userResult = await userClient.auth.getUser(token);
  const user = userResult.data.user;
  if (userResult.error || !user) {
    return Response.json({ message: "請先登入" }, { status: 401 });
  }

  const form = await request.formData();
  const questionId = String(form.get("questionId") ?? "");
  const role = String(form.get("role") ?? "");
  const file = form.get("file");
  if (!QUESTION_ID.test(questionId) || (role !== "crop" && role !== "original") || !(file instanceof File)) {
    return Response.json({ message: "圖片上傳資料不完整" }, { status: 400 });
  }

  const contentType = contentTypeOf(file.type);
  if (!contentType) {
    return Response.json({ message: "請上傳 WebP、JPEG 或 PNG" }, { status: 400 });
  }
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const objectPath = `${user.id}/${questionId}/${role}.${ext}`;
  const uploaded = await adminDb().storage.from("quiz-images").upload(objectPath, file, {
    contentType,
    upsert: false,
  });
  if (uploaded.error) {
    return Response.json({ message: uploaded.error.message }, { status: 400 });
  }

  const publicUrl = adminDb().storage.from("quiz-images").getPublicUrl(objectPath).data.publicUrl;
  return Response.json({ objectPath, publicUrl, contentType });
}
