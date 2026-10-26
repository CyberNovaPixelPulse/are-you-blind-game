import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";

export type RequestGuard =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 429 | 503; message: string };

export async function consumeAiRateLimit(
  request: Request,
  identity: string,
  limits: { perMinute: number; perHour: number },
): Promise<{ ok: true } | { ok: false; status: 429 | 503; message: string }> {
  if (!hasServiceRole()) return { ok: false, status: 503, message: "生成服務尚未就緒" };
  const address = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const db = adminDb();
  const keys = [`ai-user:${identity}`, `ai-ip:${address}`].map((value) =>
    createHash("sha256").update(value).digest("hex"),
  );

  for (const bucketKey of keys) {
    const minute = await db.rpc("consume_api_rate_limit", {
      p_key: bucketKey, p_window_seconds: 60, p_limit: limits.perMinute,
    });
    if (minute.error) return { ok: false, status: 503, message: "生成服務暫時無法使用" };
    if (minute.data !== true) return { ok: false, status: 429, message: "生成次數較多，請稍後再試" };
    const hour = await db.rpc("consume_api_rate_limit", {
      p_key: bucketKey, p_window_seconds: 3600, p_limit: limits.perHour,
    });
    if (hour.error) return { ok: false, status: 503, message: "生成服務暫時無法使用" };
    if (hour.data !== true) return { ok: false, status: 429, message: "生成次數較多，請稍後再試" };
  }
  return { ok: true };
}

export async function guardAuthenticatedAiRequest(
  request: Request,
  limits: { perMinute: number; perHour: number },
): Promise<RequestGuard> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) {
    return { ok: false, status: 401, message: "請先登入" };
  }

  const auth = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, message: "登入狀態已失效" };
  const rate = await consumeAiRateLimit(request, data.user.id, limits);
  if (!rate.ok) return rate;

  return { ok: true, userId: data.user.id };
}

export async function readJsonLimited<T>(request: Request, maxBytes: number): Promise<T | null> {
  const announced = Number(request.headers.get("content-length") ?? 0);
  if (announced > maxBytes || !request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
