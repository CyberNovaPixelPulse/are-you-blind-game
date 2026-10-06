"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  deleteQuestion,
  deleteQuestions,
  resolveQuestionReports,
  updateQuestion,
  updateQuestionScore,
  updateQuestionsStatus,
  widenAdminCookie,
} from "@/app/admin/actions";
import type { AdminQuestion } from "@/app/admin/types";
import { DIFFICULTIES, isDifficulty, type Difficulty } from "@/lib/question-options";
import { supabase } from "@/lib/supabase";

type WriteResult = { ok: true } | { ok: false; message: string };

const REPORT_HIDDEN_LABEL = "⛔ 已自動隱藏（檢舉過多）";

function isReportHidden(question: {
  status: string;
  hideReason?: string | null;
  reports: { id: string }[];
}) {
  if (question.status === "active") return false;
  if (question.hideReason === "reports") return true;
  return question.reports.length >= 3;
}

function statusChipClass(question: {
  status: string;
  hideReason?: string | null;
  reports: { id: string }[];
}) {
  if (isReportHidden(question)) return "bg-red-600 text-white";
  if (question.status === "active") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300";
}

type DraftOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  tauntText: string;
};

type QuestionDraft = {
  options: DraftOption[];
  difficulty: Difficulty;
  status: "active" | "hidden";
};

type StoredOption = {
  id: number | string;
  text: string;
  is_correct: boolean;
  taunt: string;
};

function hasStoredScore(question: AdminQuestion) {
  if (question.qualityScore === null) return false;
  if (question.qualityScore === 0 && Object.keys(question.scoreBreakdown).length === 0) return false;
  return true;
}

function scoreBadgeLabel(question: AdminQuestion) {
  if (!hasStoredScore(question) || question.qualityScore === null) return "未評分";
  const score = question.qualityScore;
  if (score >= 85) return `🟢 ${score}`;
  if (score >= 60) return `🟡 ${score}`;
  return `🔴 ${score}`;
}

function scoreBadgeClass(question: AdminQuestion) {
  if (!hasStoredScore(question) || question.qualityScore === null) {
    return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
  if (question.qualityScore >= 85) return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (question.qualityScore >= 60) return "bg-amber-400/20 text-amber-800 dark:text-amber-200";
  return "bg-red-500/15 text-red-800 dark:text-red-200";
}

type Diagnosis = {
  total: number;
  blind: number;
  guesses: string[];
  visual: number;
  visualDetail: string;
  distractor: number;
  safety: number;
  safetyOk: boolean;
  safetyDetail: string;
  suggestion: string;
};

function readPart(value: unknown, max: number) {
  if (!value || typeof value !== "object") return null;
  const score = (value as { score?: unknown }).score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  if (rounded < 0 || rounded > max) return null;
  const detail = (value as { detail?: unknown }).detail;
  return { score: rounded, detail: typeof detail === "string" ? detail.trim() : "" };
}

function readNameList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function readDiagnosis(question: AdminQuestion): Diagnosis | null {
  if (question.qualityScore === null || !hasStoredScore(question)) return null;
  const raw = question.scoreBreakdown;
  const blind = readPart(raw.blind_guess, 40);
  const visual = readPart(raw.visual_richness, 25);
  const distractor = readPart(raw.distractor_deception, 20);
  const safety = readPart(raw.safety, 15);
  if (!blind || !visual || !distractor || !safety) return null;
  const blindGuesses = readNameList(
    raw.blind_guess && typeof raw.blind_guess === "object"
      ? (raw.blind_guess as { guesses?: unknown }).guesses
      : undefined,
  );
  const guesses = readNameList(raw.ai_guesses);
  const violated =
    raw.safety &&
    typeof raw.safety === "object" &&
    (raw.safety as { violated?: unknown }).violated === true;
  return {
    total: question.qualityScore,
    blind: blind.score,
    guesses: guesses.length > 0 ? guesses : blindGuesses,
    visual: visual.score,
    visualDetail: visual.detail,
    distractor: distractor.score,
    safety: safety.score,
    safetyOk: !violated && safety.score === 15,
    safetyDetail: safety.detail,
    suggestion: typeof raw.suggestion === "string" ? raw.suggestion.trim() : "",
  };
}

function totalBadgeClass(score: number) {
  if (score >= 85) return "bg-emerald-500/20 text-emerald-200";
  if (score >= 60) return "bg-amber-400/20 text-amber-200";
  return "bg-red-500/20 text-red-200";
}

function totalBadgeMark(score: number) {
  if (score >= 85) return "🟢";
  if (score >= 60) return "🟡";
  return "🔴";
}

function draftFromQuestion(question: AdminQuestion): QuestionDraft {
  return {
    difficulty: isDifficulty(question.difficulty) ? question.difficulty : "normal",
    status: question.status === "hidden" ? "hidden" : "active",
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
      tauntText: option.tauntText,
    })),
  };
}

function isSameDraft(question: AdminQuestion, draft: QuestionDraft): boolean {
  const baseline = draftFromQuestion(question);
  if (baseline.difficulty !== draft.difficulty || baseline.status !== draft.status) return false;
  if (baseline.options.length !== draft.options.length) return false;
  return baseline.options.every((option, index) => {
    const next = draft.options[index];
    return (
      option.id === next.id &&
      option.text === next.text &&
      option.tauntText === next.tauntText &&
      option.isCorrect === next.isCorrect
    );
  });
}

function storedOptions(options: DraftOption[]): StoredOption[] {
  return options.map((option) => ({
    id: /^\d+$/.test(option.id) ? Number(option.id) : option.id,
    text: option.text.trim(),
    is_correct: option.isCorrect,
    taunt: option.tauntText.trim(),
  }));
}

function draftError(draft: QuestionDraft): string {
  if (draft.options.length > 0 && !draft.options.some((option) => option.isCorrect)) {
    return "至少要保留一個正解。";
  }
  for (const option of draft.options) {
    const text = option.text.trim();
    if (text.length < 1 || text.length > 120) return "每個選項請填 1 到 120 字。";
    if (option.tauntText.trim().length > 280) return "吐槽詞請在 280 字以內。";
  }
  return "";
}

const TOAST_KEY = "quiz-admin-toast";
const TOAST_EVENT = "quiz-admin-toast";

function publishToast(message: string) {
  sessionStorage.setItem(TOAST_KEY, message);
  window.dispatchEvent(new Event(TOAST_EVENT));
}

function clearStoredToast() {
  sessionStorage.removeItem(TOAST_KEY);
  window.dispatchEvent(new Event(TOAST_EVENT));
}

function subscribeToast(callback: () => void) {
  window.addEventListener(TOAST_EVENT, callback);
  return () => window.removeEventListener(TOAST_EVENT, callback);
}

function readStoredToast() {
  return sessionStorage.getItem(TOAST_KEY) ?? "";
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-TW", { hour12: false });
}

export function AdminBoard({
  questions,
  reportsUnavailable,
  serverWrites,
}: {
  questions: AdminQuestion[];
  reportsUnavailable: boolean;
  serverWrites: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<AdminQuestion | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const toast = useSyncExternalStore(subscribeToast, readStoredToast, () => "");
  const [sortKey, setSortKey] = useState<
    "reports" | "newest" | "oldest" | "score-desc" | "score-asc"
  >("reports");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "hidden">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | Difficulty>("all");
  const [languageFilter, setLanguageFilter] = useState<"all" | "zh-TW" | "en" | "ja">("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [clearedReports, setClearedReports] = useState<Set<string>>(new Set());
  const [statusOverride, setStatusOverride] = useState<Record<string, "active" | "hidden">>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [scoreOverride, setScoreOverride] = useState<
    Record<string, { qualityScore: number; scoreBreakdown: Record<string, unknown> }>
  >({});
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [freshQuestions, setFreshQuestions] = useState<AdminQuestion[]>([]);
  const serverIds = new Set(questions.map((question) => question.id));
  const boardQuestions = [...freshQuestions.filter((question) => !serverIds.has(question.id)), ...questions]
    .filter((question) => !removedIds.has(question.id))
    .map((question) => ({
      ...question,
      ...(scoreOverride[question.id] ?? {}),
      status: statusOverride[question.id] ?? question.status,
      hideReason: statusOverride[question.id] === "active" ? null : question.hideReason ?? null,
      reports: clearedReports.has(question.id) ? [] : question.reports,
    }));
  const reportTotal = boardQuestions.reduce((sum, question) => sum + question.reports.length, 0);
  const selected = boardQuestions.find((question) => question.id === selectedId) ?? null;
  const visible = boardQuestions
    .filter((question) => statusFilter === "all" || question.status === statusFilter)
    .filter((question) => difficultyFilter === "all" || question.difficulty === difficultyFilter)
    .filter((question) => languageFilter === "all" || question.language === languageFilter)
    .toSorted((a, b) => {
      const aFresh = freshQuestions.some((question) => question.id === a.id);
      const bFresh = freshQuestions.some((question) => question.id === b.id);
      if (aFresh !== bFresh) return aFresh ? -1 : 1;
      if (sortKey === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sortKey === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sortKey === "score-desc") return (b.qualityScore ?? -1) - (a.qualityScore ?? -1);
      if (sortKey === "score-asc") return (a.qualityScore ?? -1) - (b.qualityScore ?? -1);
      return b.reports.length - a.reports.length || b.createdAt.localeCompare(a.createdAt);
    });
  const checkedQuestions = boardQuestions.filter((question) => checked.has(question.id));
  const allVisibleSelected =
    visible.length > 0 && visible.every((question) => checked.has(question.id));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void widenAdminCookie();
      void supabase.auth.getSession().then(({ data }) => {
        setSessionEmail(data.session?.user.email ?? null);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function autoGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      await widenAdminCookie();
      const response = await fetch("/api/admin/auto-generate", { method: "POST" });
      const payload = (await response.json()) as { message?: string; question?: AdminQuestion };
      if (!response.ok || !payload.question?.id) {
        publishToast(payload.message || "出題失敗，請再試一次");
        return;
      }
      setFreshQuestions((current) => [
        payload.question as AdminQuestion,
        ...current.filter((question) => question.id !== payload.question?.id),
      ]);
      publishToast("成功生成 1 道全新 AI 題目！");
      router.refresh();
    } catch {
      publishToast("出題失敗，請再試一次");
    } finally {
      setGenerating(false);
    }
  }

  const dirty = Boolean(selected && draft && editing && !isSameDraft(selected, draft));

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => clearStoredToast(), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel("admin-report-autohide")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_reports" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "questions" },
        refresh,
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (batchDeleteOpen) {
        setBatchDeleteOpen(false);
        return;
      }
      if (resolveTarget) {
        setResolveTarget(null);
        return;
      }
      if (confirming) return;
      if (saveConfirm) {
        setSaveConfirm(false);
        return;
      }
      if (leaveConfirm) {
        setLeaveConfirm(false);
        return;
      }
      if (pendingId) return;
      if (editing && selected && draft && !isSameDraft(selected, draft)) {
        setLeaveConfirm(true);
        return;
      }
      setEditing(false);
      setDraft(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    confirming,
    saveConfirm,
    leaveConfirm,
    pendingId,
    editing,
    selected,
    draft,
    batchDeleteOpen,
    resolveTarget,
  ]);

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail(null);
  }

  async function signIn() {
    setAuthPending(true);
    setAuthError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthPending(false);
    if (error || !data.session) {
      setAuthError("帳號或密碼不正確");
      return;
    }
    setSessionEmail(data.session.user.email ?? email);
    setPassword("");
  }

  function closeReview() {
    setSaveConfirm(false);
    setLeaveConfirm(false);
    setEditing(false);
    setDraft(null);
    setSelectedId(null);
  }

  function requestClose() {
    if (pendingId || confirming || saveConfirm) return;
    if (dirty) {
      setLeaveConfirm(true);
      return;
    }
    closeReview();
  }

  function updateDraftOption(id: string, patch: Partial<DraftOption>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        options: current.options.map((option) =>
          option.id === id ? { ...option, ...patch } : option,
        ),
      };
    });
  }

  function beginEdit() {
    if (!selected) return;
    setDraft(draftFromQuestion(selected));
    setEditing(true);
    setErrors((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setSaveConfirm(false);
    if (selected) {
      setErrors((current) => {
        const next = { ...current };
        delete next[selected.id];
        return next;
      });
    }
  }

  function askSave() {
    if (!selected || !draft || pendingId || !dirty) return;
    const message = draftError(draft);
    if (message) {
      setErrors((current) => ({ ...current, [selected.id]: message }));
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });
    setSaveConfirm(true);
  }

  async function confirmSave() {
    if (!selected || !draft) return;
    setSaveConfirm(false);
    const patch = {
      options: storedOptions(draft.options),
      difficulty: draft.difficulty,
      status: draft.status,
    };
    const ok = await run(
      selected.id,
      () => (serverWrites ? updateQuestion(selected.id, patch) : authorUpdate(selected.id, patch)),
      false,
    );
    if (!ok) return;
    publishToast("已儲存對此題目的修改");
    setEditing(false);
    setDraft(null);
  }

  async function authorScoreUpdate(
    id: string,
    qualityScore: number,
    scoreBreakdown: Record<string, unknown>,
  ): Promise<WriteResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, message: "請先用題目作者帳號登入，才能修改。" };
    }
    const { data, error } = await supabase
      .from("questions")
      .update({ quality_score: qualityScore, score_breakdown: scoreBreakdown })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, message: "更新失敗：" + error.message };
    if (!data?.length) {
      return {
        ok: false,
        message: "沒有這題的寫入權限。請改登入出題作者，或在 .env.local 設定 SUPABASE_SERVICE_ROLE_KEY。",
      };
    }
    return { ok: true };
  }

  async function rediagnose(question: AdminQuestion) {
    const correct = question.options.find((option) => option.isCorrect);
    const distractors = question.options.filter((option) => !option.isCorrect);
    if (!correct?.text.trim() || distractors.length !== 3) {
      setErrors((current) => ({
        ...current,
        [question.id]: "這題需要 1 個正解和 3 個干擾項，才能重新診斷。",
      }));
      return;
    }
    if (distractors.some((option) => !option.text.trim() || !option.tauntText.trim())) {
      setErrors((current) => ({
        ...current,
        [question.id]: "干擾項和吐槽都要有內容，才能重新診斷。",
      }));
      return;
    }
    setPendingId(question.id);
    try {
      const response = await fetch("/api/moderate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctAnswer: correct.text.trim(),
          distractors: distractors.map((option) => ({
            text: option.text.trim(),
            taunt: option.tauntText.trim(),
          })),
          imagePath: question.cropPath,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        quality_score?: number;
        score_breakdown?: Record<string, unknown>;
      };
      if (
        !response.ok ||
        typeof payload.quality_score !== "number" ||
        !payload.score_breakdown ||
        typeof payload.score_breakdown !== "object"
      ) {
        throw new Error(payload.message || "重新診斷失敗，請再試一次");
      }
      const saved = serverWrites
        ? await updateQuestionScore(question.id, payload.quality_score, payload.score_breakdown)
        : await authorScoreUpdate(question.id, payload.quality_score, payload.score_breakdown);
      if (!saved.ok) throw new Error(saved.message);
      setScoreOverride((current) => ({
        ...current,
        [question.id]: {
          qualityScore: payload.quality_score as number,
          scoreBreakdown: payload.score_breakdown as Record<string, unknown>,
        },
      }));
      setErrors((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      publishToast("已更新這題的 AI 診斷");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新診斷失敗，請再試一次";
      setErrors((current) => ({ ...current, [question.id]: message }));
    } finally {
      setPendingId(null);
    }
  }

  async function authorUpdate(
    id: string,
    patch: { options: StoredOption[]; difficulty: Difficulty; status: "active" | "hidden" },
  ): Promise<WriteResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, message: "請先用題目作者帳號登入，才能修改。" };
    }
    const { data, error } = await supabase
      .from("questions")
      .update(patch)
      .eq("id", id)
      .select("id, status");
    if (error) return { ok: false, message: "更新失敗：" + error.message };
    if (patch.status === "active" && data?.[0]?.status === "hidden") {
      return { ok: false, message: "這題的未解決檢舉已滿 3 次，請先標記已解決再上架。" };
    }
    if (!data?.length) {
      return {
        ok: false,
        message: "沒有這題的寫入權限。請改登入出題作者，或在 .env.local 設定 SUPABASE_SERVICE_ROLE_KEY。",
      };
    }
    return { ok: true };
  }

  async function authorDelete(question: AdminQuestion): Promise<WriteResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, message: "請先用題目作者帳號登入，才能刪除。" };
    }
    await supabase.from("question_reports").delete().eq("question_id", question.id);
    const { data, error } = await supabase
      .from("questions")
      .delete()
      .eq("id", question.id)
      .select("id");
    if (error?.message.toLowerCase().includes("foreign key")) {
      return { ok: false, message: "這題還有檢舉紀錄，資料庫沒有一併刪除。" };
    }
    if (error || !data?.length) return { ok: false, message: "沒有這題的刪除權限。" };
    await supabase.storage
      .from("quiz-images")
      .remove([question.cropPath, question.originalPath].filter(Boolean));
    return { ok: true };
  }

  async function run(id: string, task: () => Promise<WriteResult>, refresh = true) {
    setPendingId(id);
    const result = await task();
    setPendingId(null);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [id]: result.message }));
      return false;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (refresh) router.refresh();
    return true;
  }

  function toggleChecked(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setChecked((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const question of visible) next.delete(question.id);
      } else {
        for (const question of visible) next.add(question.id);
      }
      return next;
    });
  }

  async function authorClearReports(id: string): Promise<WriteResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, message: "請先用題目作者帳號登入，才能修改。" };
    }
    const existing = await supabase.from("question_reports").select("id").eq("question_id", id);
    if (existing.error) return { ok: false, message: "檢舉讀取失敗" };
    if (!existing.data?.length) return { ok: true };
    const updated = await supabase
      .from("question_reports")
      .update({ status: "resolved" })
      .eq("question_id", id)
      .select("id");
    if (!updated.error && (updated.data?.length ?? 0) > 0) return { ok: true };
    const deleted = await supabase
      .from("question_reports")
      .delete()
      .eq("question_id", id)
      .select("id");
    if (deleted.error || !(deleted.data?.length ?? 0)) {
      return { ok: false, message: "沒有清除檢舉的權限。" };
    }
    return { ok: true };
  }

  async function confirmResolve() {
    if (!resolveTarget) return;
    const id = resolveTarget;
    setResolveTarget(null);
    const ok = await run(id, () =>
      serverWrites ? resolveQuestionReports(id) : authorClearReports(id),
    );
    if (!ok) return;
    setClearedReports((current) => new Set(current).add(id));
    publishToast("已清空這題的檢舉");
  }

  async function authorBatchStatus(
    ids: string[],
    status: "active" | "hidden",
  ): Promise<WriteResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, message: "請先用題目作者帳號登入，才能修改。" };
    }
    for (const id of ids) {
      const { data, error } = await supabase
        .from("questions")
        .update({ status })
        .eq("id", id)
        .select("id, status");
      if (error || !data?.length) return { ok: false, message: "沒有部分題目的寫入權限。" };
      if (status === "active" && data[0]?.status === "hidden") {
        return { ok: false, message: "有題目的未解決檢舉已滿 3 次，請先標記已解決再上架。" };
      }
    }
    return { ok: true };
  }

  async function batchSetStatus(status: "active" | "hidden") {
    const ids = checkedQuestions.map((question) => question.id);
    if (!ids.length || batchPending) return;
    setBatchPending(true);
    setBatchError("");
    const result = serverWrites
      ? await updateQuestionsStatus(ids, status)
      : await authorBatchStatus(ids, status);
    setBatchPending(false);
    if (!result.ok) {
      setBatchError(result.message);
      if (result.message.includes("檢舉")) router.refresh();
      return;
    }
    setStatusOverride((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = status;
      return next;
    });
    setChecked(new Set());
    router.refresh();
  }

  async function confirmBatchDelete() {
    const items = checkedQuestions.map((question) => ({
      id: question.id,
      imagePaths: [question.cropPath, question.originalPath],
    }));
    if (!items.length || batchPending) return;
    setBatchDeleteOpen(false);
    setBatchPending(true);
    setBatchError("");
    const result = serverWrites
      ? await deleteQuestions(items)
      : await authorBatchDelete(checkedQuestions);
    setBatchPending(false);
    if (!result.ok) {
      setBatchError(result.message);
      return;
    }
    setRemovedIds((current) => {
      const next = new Set(current);
      for (const item of items) next.add(item.id);
      return next;
    });
    setChecked(new Set());
    if (selectedId && items.some((item) => item.id === selectedId)) closeReview();
    router.refresh();
  }

  async function authorBatchDelete(list: AdminQuestion[]): Promise<WriteResult> {
    for (const question of list) {
      const result = await authorDelete(question);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  return (
    <main
      className={`min-h-screen bg-zinc-100 px-6 py-8 font-sans text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 ${
        checkedQuestions.length > 0 ? "pb-28" : ""
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50">
              回猜題首頁
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">題目審查</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {boardQuestions.length} 題 · 檢舉 {reportTotal} 次
              {serverWrites ? " · 可管理所有題目" : sessionEmail ? ` · ${sessionEmail}` : " · 尚未登入作者帳號"}
            </p>
            {!serverWrites && sessionEmail ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-2 text-sm text-zinc-500 underline-offset-2 hover:underline"
              >
                登出這個帳號
              </button>
            ) : null}
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => void autoGenerate()}
            className="h-12 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-600/30 disabled:opacity-60"
          >
            {generating ? "AI 正在繪圖與命題中..." : "🤖 AI 一鍵出題"}
          </button>
        </header>

        {reportsUnavailable ? (
          <p className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            檢舉清單讀取失敗，題目仍可審查。
          </p>
        ) : null}

        {!serverWrites && !sessionEmail ? (
          <form
            className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm font-medium">
              作者 Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
              密碼
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              />
            </label>
            <button
              type="submit"
              disabled={authPending}
              className="h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {authPending ? "登入中…" : "登入後才能改題"}
            </button>
            {authError ? <p className="w-full text-sm text-red-600">{authError}</p> : null}
          </form>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              排序
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
                className="h-11 min-w-64 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              >
                <option value="reports">🚨 被檢舉次數（高到低）</option>
                <option value="newest">🕒 建立時間（最新到最舊）</option>
                <option value="oldest">⏳ 建立時間（最舊到最新）</option>
                <option value="score-desc">評分（從高到低）</option>
                <option value="score-asc">評分（從低到高）</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              狀態
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-11 min-w-44 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              >
                <option value="all">全部</option>
                <option value="active">已上架 (active)</option>
                <option value="hidden">已隱藏 (hidden)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              難度
              <select
                value={difficultyFilter}
                onChange={(event) =>
                  setDifficultyFilter(event.target.value as typeof difficultyFilter)
                }
                className="h-11 min-w-36 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              >
                <option value="all">全部</option>
                {DIFFICULTIES.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              語言
              <select
                value={languageFilter}
                onChange={(event) =>
                  setLanguageFilter(event.target.value as typeof languageFilter)
                }
                className="h-11 min-w-48 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none dark:border-white/15"
              >
                <option value="all">全部語言</option>
                <option value="zh-TW">繁體中文 (zh-TW)</option>
                <option value="en">English (en)</option>
                <option value="ja">日本語 (ja)</option>
              </select>
            </label>
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={toggleVisibleSelection}
              className="h-11 rounded-xl border border-black/10 px-4 text-sm font-semibold disabled:opacity-40 dark:border-white/15"
            >
              {allVisibleSelected ? "取消全選" : "全選"}
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            共 {boardQuestions.length} 道題目（目前篩選出 {visible.length} 道）
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-zinc-500">
            {boardQuestions.length === 0 ? "目前沒有題目。" : "沒有符合這個篩選的題目。"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
            {visible.map((question) => {
              const answer =
                question.options.find((option) => option.isCorrect)?.text || "尚未設定正解";
              const reportHidden = isReportHidden(question);
              return (
                <div
                  key={question.id}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left dark:bg-zinc-900 ${
                    checked.has(question.id)
                      ? "border-red-400"
                      : "border-black/10 dark:border-white/10"
                  }`}
                >
                  <label className="absolute top-2 left-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-black/65">
                    <input
                      type="checkbox"
                      checked={checked.has(question.id)}
                      aria-label="選取這題"
                      onChange={() => toggleChecked(question.id)}
                      className="h-4 w-4 accent-red-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft(null);
                      setSaveConfirm(false);
                      setLeaveConfirm(false);
                      setSelectedId(question.id);
                    }}
                    className="flex flex-col text-left"
                  >
                  <div className="relative aspect-square overflow-hidden bg-zinc-900">
                    <Image
                      src={question.cropUrl}
                      alt={`${answer} 的特寫`}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-cover"
                    />
                    {question.reports.length > 0 ? (
                      <span className="absolute top-2 right-2 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white shadow">
                        🚩 {question.reports.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <p className="truncate text-sm font-bold">{answer}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(question)}`}
                      >
                        {reportHidden ? REPORT_HIDDEN_LABEL : question.status}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        {question.difficulty}
                      </span>
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
                        {question.language}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadgeClass(question)}`}>
                        {scoreBadgeLabel(question)}
                      </span>
                    </div>
                  </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={requestClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-5 text-zinc-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const question = selected;
              const fieldOptions = editing && draft ? draft.options : question.options;
              const correct = fieldOptions.filter((option) => option.isCorrect);
              const distractors = fieldOptions.filter((option) => !option.isCorrect);
              const pending = pendingId === question.id;
              const shownDifficulty = editing && draft ? draft.difficulty : question.difficulty;
              const shownStatus = editing && draft ? draft.status : question.status;
              const fieldClass =
                "mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm font-normal text-zinc-50 outline-none";
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 id="review-title" className="text-xl font-bold">
                        {correct[0]?.text || "尚未設定正解"}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {question.authorName} · {formatWhen(question.createdAt)}
                        {editing ? " · 編輯模式" : " · 檢視模式"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {editing ? null : (
                        <button
                          type="button"
                          onClick={beginEdit}
                          className="h-10 rounded-full bg-white px-4 text-sm font-semibold text-zinc-950"
                        >
                          ✏️ 編輯內容
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={requestClose}
                        className="h-10 rounded-full px-4 text-sm font-semibold text-zinc-300 hover:bg-white/10"
                      >
                        關閉彈窗
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <figure className="flex flex-col gap-2">
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-900">
                        <Image
                          src={question.cropUrl}
                          alt="特寫圖"
                          fill
                          sizes="480px"
                          className="object-cover"
                        />
                      </div>
                      <figcaption className="text-center text-xs text-zinc-400">特寫圖</figcaption>
                    </figure>
                    <figure className="flex flex-col gap-2">
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-900">
                        <Image
                          src={question.originalUrl}
                          alt="完整原圖"
                          fill
                          sizes="480px"
                          className="object-contain"
                        />
                      </div>
                      <figcaption className="text-center text-xs text-zinc-400">完整原圖</figcaption>
                    </figure>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {correct.length === 0 && distractors.length === 0 ? (
                      <p className="text-sm text-zinc-400">這題的 options 是空的。</p>
                    ) : null}
                    {correct.map((option) =>
                      editing && draft ? (
                        <div
                          key={option.id}
                          className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-emerald-100"
                        >
                          <label className="block text-sm font-semibold">
                            正解名稱
                            <input
                              value={option.text}
                              maxLength={120}
                              onChange={(event) =>
                                updateDraftOption(option.id, { text: event.target.value })
                              }
                              className={fieldClass}
                            />
                          </label>
                          <label className="mt-3 block text-sm font-semibold">
                            吐槽詞
                            <textarea
                              value={option.tauntText}
                              maxLength={280}
                              rows={2}
                              onChange={(event) =>
                                updateDraftOption(option.id, { tauntText: event.target.value })
                              }
                              className={fieldClass}
                            />
                          </label>
                        </div>
                      ) : (
                        <div
                          key={option.id}
                          className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-emerald-200"
                        >
                          <p className="font-semibold">正解 · {option.text}</p>
                          {option.tauntText ? (
                            <p className="mt-1 text-sm leading-6">「{option.tauntText}」</p>
                          ) : null}
                        </div>
                      ),
                    )}
                    {distractors.map((option) =>
                      editing && draft ? (
                        <div key={option.id} className="rounded-2xl bg-red-500/10 px-4 py-3 text-red-100">
                          <label className="block text-sm font-semibold">
                            干擾選項
                            <input
                              value={option.text}
                              maxLength={120}
                              onChange={(event) =>
                                updateDraftOption(option.id, { text: event.target.value })
                              }
                              className={fieldClass}
                            />
                          </label>
                          <label className="mt-3 block text-sm font-semibold">
                            吐槽詞
                            <textarea
                              value={option.tauntText}
                              maxLength={280}
                              rows={2}
                              onChange={(event) =>
                                updateDraftOption(option.id, { tauntText: event.target.value })
                              }
                              className={fieldClass}
                            />
                          </label>
                        </div>
                      ) : (
                        <div key={option.id} className="rounded-2xl bg-red-500/10 px-4 py-3 text-red-200">
                          <p className="font-semibold">{option.text}</p>
                          <p className="mt-1 text-sm leading-6">
                            {option.tauntText ? `「${option.tauntText}」` : "（沒有吐槽詞）"}
                          </p>
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-zinc-400">難度</p>
                      {editing && draft ? (
                        <select
                          value={draft.difficulty}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (!isDifficulty(value)) return;
                            setDraft({ ...draft, difficulty: value });
                          }}
                          className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm font-semibold"
                        >
                          {DIFFICULTIES.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
                          {shownDifficulty}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-400">狀態</p>
                      {editing && draft ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={draft.status === "active"}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              status: draft.status === "active" ? "hidden" : "active",
                            })
                          }
                          className={`mt-2 h-11 rounded-full px-4 text-sm font-semibold ${
                            draft.status === "active"
                              ? "bg-emerald-500 text-white"
                              : "bg-zinc-600 text-white"
                          }`}
                        >
                          {draft.status === "active" ? "active · 上架" : "hidden · 隱藏"}
                        </button>
                      ) : (
                        <>
                          <p
                            className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                              isReportHidden({ ...question, status: shownStatus })
                                ? "bg-red-600 text-white"
                                : shownStatus === "active"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-zinc-500/20 text-zinc-300"
                            }`}
                          >
                            {isReportHidden({ ...question, status: shownStatus })
                              ? REPORT_HIDDEN_LABEL
                              : shownStatus}
                          </p>
                          {isReportHidden(question) ? (
                            <p className="mt-2 text-xs leading-5 text-zinc-400">
                              標記已解決後，再把狀態切回 active，這題就會回到題庫。
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold">🤖 AI 題庫診斷</h3>
                    {(() => {
                      const diagnosis = readDiagnosis(question);
                      if (!diagnosis) {
                        return (
                          <p className="mt-3 text-sm leading-6 text-zinc-400">
                            尚未產生細部評分。點下方「AI 重新診斷」產生 100 分細項。
                          </p>
                        );
                      }
                      return (
                        <div className="mt-3 flex flex-col gap-3">
                          <span
                            className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${totalBadgeClass(diagnosis.total)}`}
                          >
                            {totalBadgeMark(diagnosis.total)} {diagnosis.total} / 100 分
                          </span>
                          <ul className="flex flex-col gap-2 text-sm">
                            <li className="rounded-xl bg-black/20 px-3 py-2">
                              <p className="font-semibold">盲猜測驗 {diagnosis.blind}/40</p>
                              {diagnosis.guesses.length > 0 ? (
                                <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-300">
                                  {diagnosis.guesses.map((guess, index) => (
                                    <li key={`${guess}-${index}`}>{guess}</li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="mt-1 text-zinc-400">沒有留下盲猜名稱。</p>
                              )}
                            </li>
                            <li className="rounded-xl bg-black/20 px-3 py-2">
                              <p className="font-semibold">視覺特徵度 {diagnosis.visual}/25</p>
                              <p className="mt-1 text-zinc-300">
                                {diagnosis.visualDetail || "尚未留下特徵清晰度評語。"}
                              </p>
                            </li>
                            <li className="rounded-xl bg-black/20 px-3 py-2">
                              <p className="font-semibold">干擾項與吐槽 {diagnosis.distractor}/20</p>
                            </li>
                            <li className="rounded-xl bg-black/20 px-3 py-2">
                              <p className="font-semibold">
                                安全合規 {diagnosis.safety}/15 · {diagnosis.safetyOk ? "通過" : "未通過"}
                              </p>
                              {diagnosis.safetyDetail ? (
                                <p className="mt-1 text-zinc-300">{diagnosis.safetyDetail}</p>
                              ) : null}
                            </li>
                          </ul>
                          {diagnosis.suggestion ? (
                            <p className="rounded-xl bg-white/10 px-3 py-2 text-sm text-zinc-300">
                              <span className="font-semibold text-zinc-200">AI 建議</span>
                              <span className="mt-1 block">{diagnosis.suggestion}</span>
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void rediagnose(question)}
                      className="mt-4 h-10 rounded-full border border-white/15 px-4 text-sm font-semibold disabled:opacity-40"
                    >
                      {pending ? "診斷中…" : "🤖 AI 重新診斷"}
                    </button>
                    {errors[question.id] ? (
                      <p className="mt-2 text-sm text-red-300">{errors[question.id]}</p>
                    ) : null}
                  </section>

                  <div className="mt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold">檢舉 {question.reports.length} 次</p>
                      <button
                        type="button"
                        disabled={pending || question.reports.length === 0}
                        onClick={() => setResolveTarget(question.id)}
                        className="h-10 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        ✅ 標記已解決（清空檢舉）
                      </button>
                    </div>
                    {question.reports.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-400">沒有玩家回報。</p>
                    ) : (
                      <ul className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto">
                        {question.reports.map((report) => (
                          <li key={report.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                            <p className="font-medium">{report.reason}</p>
                            <p className="mt-1 leading-6 text-zinc-300">
                              {report.details || "（未填說明）"}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{formatWhen(report.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {errors[question.id] ? (
                    <p className="mt-4 text-sm text-red-300">{errors[question.id]}</p>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          disabled={pending || !dirty}
                          onClick={askSave}
                          className="h-12 flex-1 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50"
                        >
                          {pending ? "儲存中…" : "儲存修改"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={cancelEdit}
                          className="h-12 flex-1 rounded-xl border border-white/15 text-sm font-semibold disabled:opacity-50"
                        >
                          取消編輯
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirming(question)}
                          className="h-12 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          刪除此題
                        </button>
                        <button
                          type="button"
                          onClick={requestClose}
                          className="h-12 flex-1 rounded-xl border border-white/15 text-sm font-semibold"
                        >
                          關閉彈窗
                        </button>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-900 dark:text-zinc-50"
          >
            <h2 id="delete-title" className="text-lg font-semibold">
              刪除題目
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              確定從資料庫刪除「{confirming.authorName}」的這題？此動作無法復原。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="h-11 flex-1 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const question = confirming;
                  setConfirming(null);
                  void run(question.id, () =>
                    serverWrites
                      ? deleteQuestion(question.id, [question.cropPath, question.originalPath])
                      : authorDelete(question),
                  );
                }}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-900 dark:text-zinc-50"
          >
            <h2 id="save-title" className="text-lg font-semibold">
              儲存修改
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              確定要儲存對此題目的修改嗎？
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSaveConfirm(false)}
                className="h-11 flex-1 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmSave()}
                className="h-11 flex-1 rounded-xl bg-zinc-950 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
              >
                確定儲存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {leaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-900 dark:text-zinc-50"
          >
            <h2 id="leave-title" className="text-lg font-semibold">
              尚未儲存
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              有未儲存的變更，確定要退出嗎？
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setLeaveConfirm(false)}
                className="h-11 flex-1 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15"
              >
                繼續編輯
              </button>
              <button
                type="button"
                onClick={closeReview}
                className="h-11 flex-1 rounded-xl bg-zinc-950 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
              >
                確定退出
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resolveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-900 dark:text-zinc-50"
          >
            <h2 id="resolve-title" className="text-lg font-semibold">
              清空檢舉
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              確定要將這題的檢舉標記為已解決並清空嗎？畫面上的檢舉數會歸零。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setResolveTarget(null)}
                className="h-11 flex-1 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmResolve()}
                className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white"
              >
                確定清空
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {batchDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-delete-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-900 dark:text-zinc-50"
          >
            <h2 id="batch-delete-title" className="text-lg font-semibold">
              批次刪除
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              確定要刪除這 {checkedQuestions.length} 道題目嗎？此動作不可還原
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setBatchDeleteOpen(false)}
                className="h-11 flex-1 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmBatchDelete()}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {checkedQuestions.length > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-zinc-950/80 px-4 py-3 text-white shadow-2xl backdrop-blur-md">
            <p className="text-sm font-semibold">已選中 {checkedQuestions.length} 題</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={batchPending}
                onClick={() => void batchSetStatus("hidden")}
                className="h-10 rounded-full border border-white/20 px-4 text-sm font-semibold disabled:opacity-40"
              >
                批次下架 (Hide)
              </button>
              <button
                type="button"
                disabled={batchPending}
                onClick={() => void batchSetStatus("active")}
                className="h-10 rounded-full border border-white/20 px-4 text-sm font-semibold disabled:opacity-40"
              >
                批次上架 (Active)
              </button>
              <button
                type="button"
                disabled={batchPending}
                onClick={() => setBatchDeleteOpen(true)}
                className="h-10 rounded-full bg-red-600 px-4 text-sm font-semibold disabled:opacity-40"
              >
                批次刪除 (Delete)
              </button>
            </div>
            {batchError ? <p className="w-full text-sm text-red-300">{batchError}</p> : null}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="animate-toast-in rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </main>
  );
}
