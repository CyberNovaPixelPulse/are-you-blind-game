import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBoard } from "@/app/admin/admin-board";
import type { AdminQuestion, AdminReport } from "@/app/admin/types";
import { unlockAdmin } from "@/app/admin/actions";
import { assertLocalDev, hasAdminSession } from "@/lib/admin-access";
import { readStoredOptions } from "@/lib/question-options";
import { hasServiceRole } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "題目審查",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const QUESTION_COLUMNS =
  "id, author_name, crop_image_path, original_image_path, status, difficulty, language, options, created_at";
const REPORT_COLUMNS = "id, question_id, reason_category, details, created_at";

type QuestionRow = {
  id: string;
  author_name: string;
  crop_image_path: string;
  original_image_path: string;
  status: string;
  difficulty: string;
  language?: string | null;
  options: unknown;
  created_at: string;
  solvability_score?: unknown;
  category?: unknown;
  quality_score?: unknown;
  score_breakdown?: unknown;
};

type ReportRow = {
  id: string;
  question_id: string;
  reason_category: string;
  details: string | null;
  created_at: string;
  status?: string | null;
};

function missingColumn(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("column") || text.includes("schema cache");
}

function readScore(value: unknown): number {
  const score = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(score)) return 8;
  return Math.min(10, Math.max(0, score));
}

function readCategory(value: unknown): string {
  if (typeof value !== "string") return "未分類";
  const text = value.trim();
  return text || "未分類";
}

function readLanguage(value: unknown): string {
  if (typeof value !== "string") return "zh-TW";
  const text = value.trim();
  return text || "zh-TW";
}

function readQualityScore(value: unknown): number | null {
  const score = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function readBreakdown(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function publicImageUrl(path: string): string {
  return supabase.storage.from("quiz-images").getPublicUrl(path).data.publicUrl;
}

function AdminGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <form
        action={unlockAdmin}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold">管理金鑰</h1>
        <p className="mt-2 text-sm text-zinc-500">只接受本機開發環境。</p>
        <label className="mt-5 flex flex-col gap-2 text-sm font-medium">
          金鑰
          <input
            name="key"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
          />
        </label>
        <button
          type="submit"
          className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background"
        >
          進入
        </button>
      </form>
    </main>
  );
}

export default async function AdminPage() {
  await assertLocalDev();
  if (!process.env.ADMIN_SECRET) notFound();
  if (!(await hasAdminSession())) return <AdminGate />;

  const [questionsAttempt, reportsAttempt, hideAttempt] = await Promise.all([
    supabase
      .from("questions")
      .select(`${QUESTION_COLUMNS}, solvability_score, category, quality_score, score_breakdown`),
    supabase.from("question_reports").select(`${REPORT_COLUMNS}, status`),
    supabase.from("questions").select("id, hide_reason"),
  ]);
  const questionsResult = questionsAttempt.error && missingColumn(questionsAttempt.error.message)
    ? await supabase.from("questions").select(QUESTION_COLUMNS)
    : questionsAttempt;
  const reportsResult = reportsAttempt.error && missingColumn(reportsAttempt.error.message)
    ? await supabase.from("question_reports").select(REPORT_COLUMNS)
    : reportsAttempt;

  if (questionsResult.error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 font-sans">
        <p className="text-sm text-red-600">題目讀取失敗，請再整理一次。</p>
      </main>
    );
  }

  const reportsByQuestion = new Map<string, AdminReport[]>();
  if (!reportsResult.error) {
    for (const row of (reportsResult.data ?? []) as ReportRow[]) {
      const list = reportsByQuestion.get(row.question_id) ?? [];
      if (row.status === "resolved") continue;
      list.push({
        id: row.id,
        reason: row.reason_category,
        details: row.details?.trim() ?? "",
        createdAt: row.created_at,
      });
      reportsByQuestion.set(row.question_id, list);
    }
  }

  const hideReasonById = new Map<string, string | null>();
  if (!hideAttempt.error) {
    for (const row of (hideAttempt.data ?? []) as { id: string; hide_reason: string | null }[]) {
      hideReasonById.set(row.id, row.hide_reason ?? null);
    }
  }

  const questions: AdminQuestion[] = ((questionsResult.data ?? []) as QuestionRow[])
    .map((row) => ({
      id: row.id,
      authorName: row.author_name,
      createdAt: row.created_at,
      cropUrl: publicImageUrl(row.crop_image_path),
      originalUrl: publicImageUrl(row.original_image_path),
      cropPath: row.crop_image_path,
      originalPath: row.original_image_path,
      status: row.status,
      hideReason: hideReasonById.get(row.id) ?? null,
      difficulty: row.difficulty,
      language: readLanguage(row.language),
      options: readStoredOptions(row.options),
      reports: reportsByQuestion.get(row.id) ?? [],
      solvabilityScore: readScore(row.solvability_score),
      category: readCategory(row.category),
      qualityScore: readQualityScore(row.quality_score),
      scoreBreakdown: readBreakdown(row.score_breakdown),
    }))
    .sort((a, b) => b.reports.length - a.reports.length || b.createdAt.localeCompare(a.createdAt));

  return (
    <AdminBoard
      questions={questions}
      reportsUnavailable={Boolean(reportsResult.error)}
      serverWrites={hasServiceRole()}
    />
  );
}
