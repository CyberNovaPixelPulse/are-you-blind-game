"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminCookieName,
  adminCookieValue,
  adminKeyMatches,
  assertLocalDev,
  clearAdminCookie,
  hasAdminSession,
  requireAdmin,
} from "@/lib/admin-access";
import { isDifficulty, type Difficulty } from "@/lib/question-options";
import { quizImageObjectPath } from "@/lib/quiz-image";
import { adminDb, hasServiceRole } from "@/lib/supabase-admin";

type ActionResult = { ok: true } | { ok: false; message: string };

function refreshAdmin() {
  revalidatePath("/admin");
}

export type UnlockState = {
  error: string;
  nonce: string;
};

const KEY_REJECTED = "金鑰錯誤，請重新輸入";

function rejectedKey(): UnlockState {
  return { error: KEY_REJECTED, nonce: crypto.randomUUID() };
}

export async function unlockAdmin(_previous: UnlockState, formData: FormData): Promise<UnlockState> {
  await assertLocalDev();
  const raw = formData instanceof FormData ? formData.get("key") : null;
  const key = typeof raw === "string" ? raw : "";
  if (!adminKeyMatches(key)) {
    await clearAdminCookie();
    return rejectedKey();
  }
  const cookie = adminCookieValue();
  if (!cookie) {
    await clearAdminCookie();
    return rejectedKey();
  }
  const jar = await cookies();
  jar.set(adminCookieName(), cookie, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export async function lockAdmin() {
  await assertLocalDev();
  await clearAdminCookie();
  redirect("/admin");
}

export async function widenAdminCookie() {
  await assertLocalDev();
  if (!(await hasAdminSession())) return;
  const cookie = adminCookieValue();
  if (!cookie) return;
  const jar = await cookies();
  jar.set(adminCookieName(), cookie, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

async function writeQuestion(
  id: string,
  patch: { difficulty?: Difficulty; status?: "active" | "hidden" },
): Promise<ActionResult> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "題目編號不正確" };
  if (!hasServiceRole()) {
    return { ok: false, message: "NEED_AUTHOR_SESSION" };
  }
  const { data, error } = await adminDb()
    .from("questions")
    .update(patch)
    .eq("id", id)
    .select("id, status");
  if (error || !data?.length) return { ok: false, message: "題目更新失敗" };
  if (patch.status === "active" && data[0]?.status === "hidden") {
    refreshAdmin();
    return { ok: false, message: "這題的未解決檢舉已滿 3 次，請先標記已解決再上架。" };
  }
  refreshAdmin();
  return { ok: true };
}

export async function updateDifficulty(id: string, difficulty: string): Promise<ActionResult> {
  if (!isDifficulty(difficulty)) return { ok: false, message: "難度不正確" };
  return writeQuestion(id, { difficulty });
}

export async function updateStatus(
  id: string,
  status: "active" | "hidden",
): Promise<ActionResult> {
  if (status !== "active" && status !== "hidden") {
    return { ok: false, message: "狀態不正確" };
  }
  return writeQuestion(id, { status });
}

function readOptionPatch(value: unknown): { id: number | string; text: string; is_correct: boolean; taunt: string }[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const options: { id: number | string; text: string; is_correct: boolean; taunt: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as { id?: unknown; text?: unknown; is_correct?: unknown; taunt?: unknown };
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const taunt = typeof row.taunt === "string" ? row.taunt.trim() : "";
    if (text.length < 1 || text.length > 120 || taunt.length > 280) return null;
    if (row.is_correct !== true && row.is_correct !== false) return null;
    if (typeof row.id === "number" && Number.isFinite(row.id)) {
      options.push({ id: row.id, text, is_correct: row.is_correct, taunt });
      continue;
    }
    if (typeof row.id === "string" && row.id.length > 0 && row.id.length <= 40) {
      options.push({
        id: /^\d+$/.test(row.id) ? Number(row.id) : row.id,
        text,
        is_correct: row.is_correct,
        taunt,
      });
      continue;
    }
    return null;
  }
  if (!options.some((option) => option.is_correct)) return null;
  return options;
}

export async function updateQuestionScore(
  id: string,
  qualityScore: number,
  scoreBreakdown: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "題目編號不正確" };
  if (!Number.isInteger(qualityScore) || qualityScore < 0 || qualityScore > 100) {
    return { ok: false, message: "分數不正確" };
  }
  if (!scoreBreakdown || typeof scoreBreakdown !== "object" || Array.isArray(scoreBreakdown)) {
    return { ok: false, message: "評分細項不正確" };
  }
  if (!hasServiceRole()) return { ok: false, message: "NEED_AUTHOR_SESSION" };
  const { data, error } = await adminDb()
    .from("questions")
    .update({ quality_score: qualityScore, score_breakdown: scoreBreakdown })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "評分更新失敗" };
  refreshAdmin();
  return { ok: true };
}

export async function updateQuestion(
  id: string,
  patch: { options: unknown; difficulty: string; status: string },
): Promise<ActionResult> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "題目編號不正確" };
  if (!isDifficulty(patch.difficulty)) return { ok: false, message: "難度不正確" };
  if (patch.status !== "active" && patch.status !== "hidden") {
    return { ok: false, message: "狀態不正確" };
  }
  const options = readOptionPatch(patch.options);
  if (!options) return { ok: false, message: "選項內容不正確" };
  if (!hasServiceRole()) return { ok: false, message: "NEED_AUTHOR_SESSION" };
  const { data, error } = await adminDb()
    .from("questions")
    .update({ options, difficulty: patch.difficulty, status: patch.status })
    .eq("id", id)
    .select("id, status");
  if (error || !data?.length) return { ok: false, message: "題目更新失敗" };
  if (patch.status === "active" && data[0]?.status === "hidden") {
    refreshAdmin();
    return { ok: false, message: "這題的未解決檢舉已滿 3 次，請先標記已解決再上架。" };
  }
  refreshAdmin();
  return { ok: true };
}

export async function deleteQuestion(
  id: string,
  imagePaths: string[],
): Promise<ActionResult> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "題目編號不正確" };
  if (!hasServiceRole()) {
    return { ok: false, message: "NEED_AUTHOR_SESSION" };
  }
  const db = adminDb();
  await db.from("question_reports").delete().eq("question_id", id);
  const { data, error } = await db.from("questions").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "題目刪除失敗" };
  const paths = imagePaths.map(quizImageObjectPath).filter((path) => path && !path.includes(".."));
  if (paths.length > 0) {
    await db.storage.from("quiz-images").remove(paths);
  }
  refreshAdmin();
  return { ok: true };
}

function questionIds(ids: string[]): string[] | null {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return null;
  const unique = [...new Set(ids)];
  if (!unique.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return null;
  return unique;
}

async function clearQuestionReports(
  db: ReturnType<typeof adminDb>,
  id: string,
): Promise<ActionResult> {
  const existing = await db.from("question_reports").select("id").eq("question_id", id);
  if (existing.error) return { ok: false, message: "檢舉讀取失敗" };
  if (!existing.data?.length) return { ok: true };
  const updated = await db
    .from("question_reports")
    .update({ status: "resolved" })
    .eq("question_id", id)
    .select("id");
  if (!updated.error && (updated.data?.length ?? 0) > 0) return { ok: true };
  const deleted = await db.from("question_reports").delete().eq("question_id", id).select("id");
  if (deleted.error || !(deleted.data?.length ?? 0)) {
    return { ok: false, message: "沒有清除檢舉的權限。" };
  }
  return { ok: true };
}

export async function resolveQuestionReports(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "題目編號不正確" };
  if (!hasServiceRole()) return { ok: false, message: "NEED_AUTHOR_SESSION" };
  const result = await clearQuestionReports(adminDb(), id);
  if (!result.ok) return result;
  refreshAdmin();
  return { ok: true };
}

export async function updateQuestionsStatus(
  ids: string[],
  status: "active" | "hidden",
): Promise<ActionResult> {
  await requireAdmin();
  const clean = questionIds(ids);
  if (!clean) return { ok: false, message: "題目編號不正確" };
  if (status !== "active" && status !== "hidden") return { ok: false, message: "狀態不正確" };
  if (!hasServiceRole()) return { ok: false, message: "NEED_AUTHOR_SESSION" };
  const { data, error } = await adminDb()
    .from("questions")
    .update({ status })
    .in("id", clean)
    .select("id, status");
  if (error || (data?.length ?? 0) !== clean.length) return { ok: false, message: "批次更新失敗" };
  if (status === "active" && (data ?? []).some((row) => row.status === "hidden")) {
    refreshAdmin();
    return { ok: false, message: "有題目的未解決檢舉已滿 3 次，請先標記已解決再上架。" };
  }
  refreshAdmin();
  return { ok: true };
}

export async function deleteQuestions(
  items: { id: string; imagePaths: string[] }[],
): Promise<ActionResult> {
  await requireAdmin();
  const clean = questionIds(items.map((item) => item.id));
  if (!clean) return { ok: false, message: "題目編號不正確" };
  if (!hasServiceRole()) return { ok: false, message: "NEED_AUTHOR_SESSION" };
  const db = adminDb();
  await db.from("question_reports").delete().in("question_id", clean);
  const { data, error } = await db.from("questions").delete().in("id", clean).select("id");
  if (error || (data?.length ?? 0) !== clean.length) return { ok: false, message: "批次刪除失敗" };
  const paths = items
    .flatMap((item) => item.imagePaths)
    .map(quizImageObjectPath)
    .filter((path) => path && !path.includes(".."));
  if (paths.length > 0) await db.storage.from("quiz-images").remove(paths);
  refreshAdmin();
  return { ok: true };
}
