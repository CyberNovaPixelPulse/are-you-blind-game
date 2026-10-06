"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Area, Point } from "react-easy-crop";
import type { User } from "@supabase/supabase-js";
import { cropToFile, compressToWebp } from "@/lib/image";
import { supabase } from "@/lib/supabase";

const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false });

const OPTION_COUNT = 4;

type OptionDraft = {
  optionText: string;
  tauntText: string;
};

type PublishResult = {
  cropUrl: string;
  originalUrl: string;
  cropBytes: number;
  originalBytes: number;
  qualityScore: number;
  breakdown: ScoreBreakdown;
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

type ModerationReport = {
  qualityScore: number;
  guesses: string[];
  breakdown: ScoreBreakdown;
  suggestion: string;
};

function emptyOptions(): OptionDraft[] {
  return Array.from({ length: OPTION_COUNT }, () => ({
    optionText: "",
    tauntText: "",
  }));
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function scoreBadgeText(score: number) {
  if (score >= 85) return `🟢 ${score} 優質`;
  return `🟡 ${score} 合格`;
}

function scoreBadgeClass(score: number) {
  if (score >= 85) return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  return "bg-amber-400/20 text-amber-800 dark:text-amber-200";
}

function readSlice(value: unknown, max: number): ScoreSlice | null {
  if (!value || typeof value !== "object") return null;
  const score = (value as { score?: unknown }).score;
  const sliceMax = (value as { max?: unknown }).max;
  const detail = (value as { detail?: unknown }).detail;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > max) return null;
  if (sliceMax !== max || typeof detail !== "string") return null;
  return { score, max, detail };
}

function readReview(value: {
  quality_score?: number;
  score_breakdown?: ScoreBreakdown;
  guesses?: string[];
  suggestion?: string;
}): ModerationReport | null {
  const breakdown = value.score_breakdown;
  if (!breakdown || typeof value.quality_score !== "number" || !Number.isInteger(value.quality_score)) {
    return null;
  }
  if (value.quality_score < 0 || value.quality_score > 100) return null;
  const blind = readSlice(breakdown.blind_guess, 40);
  const visual = readSlice(breakdown.visual_richness, 25);
  const deception = readSlice(breakdown.distractor_deception, 20);
  const safety = readSlice(breakdown.safety, 15);
  const guesses = Array.isArray(value.guesses)
    ? value.guesses.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (!blind || !visual || !deception || !safety || guesses.length !== 3) return null;
  if (typeof breakdown.safety.violated !== "boolean") return null;
  if (typeof breakdown.blind_guess.level !== "string") return null;
  const storedSuggestion =
    typeof breakdown.suggestion === "string" && breakdown.suggestion.trim()
      ? breakdown.suggestion
      : typeof value.suggestion === "string"
        ? value.suggestion
        : "";
  return {
    qualityScore: value.quality_score,
    guesses,
    breakdown: {
      blind_guess: { ...blind, guesses, level: breakdown.blind_guess.level },
      visual_richness: visual,
      distractor_deception: deception,
      safety: { ...safety, violated: breakdown.safety.violated },
      ai_guesses: guesses,
      suggestion: storedSuggestion,
    },
    suggestion: typeof value.suggestion === "string" ? value.suggestion : "",
  };
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : "出題失敗，請再試一次";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "帳號或密碼不正確";
  }
  if (normalized.includes("email not confirmed")) {
    return "請先到信箱完成驗證，再登入";
  }
  if (normalized.includes("row-level security") || normalized.includes("jwt")) {
    return "沒有寫入權限。請確認已登入。";
  }
  if (
    normalized.includes("maximum allowed size") ||
    normalized.includes("payload too large")
  ) {
    return "圖片超過 150KB，已中止上傳";
  }
  if (normalized.includes("mime")) {
    return "只能上傳 WebP";
  }
  return message;
}

export default function CreatePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authPending, setAuthPending] = useState(false);

  const [authorName, setAuthorName] = useState("匿名出題者");
  const authorTouched = useRef(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.8);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>(emptyOptions);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "compressing" | "moderating" | "uploading" | "saving"
  >("idle");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const [moderationReport, setModerationReport] = useState<ModerationReport | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || authorTouched.current) return;
    if (!user) {
      setAuthorName("匿名出題者");
      return;
    }

    let active = true;
    void supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || authorTouched.current) return;
        const fromProfile =
          !error && typeof data?.username === "string" ? data.username.trim() : "";
        const meta = user.user_metadata ?? {};
        const fromMeta = String(meta.full_name || meta.name || "").trim();
        const fromEmail = user.email?.split("@")[0]?.trim() ?? "";
        setAuthorName((fromProfile || fromMeta || fromEmail || "匿名出題者").slice(0, 40));
      });

    return () => {
      active = false;
    };
  }, [authReady, user]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.cropUrl);
        URL.revokeObjectURL(result.originalUrl);
      }
    };
  }, [result]);

  async function generateDistractors() {
    const correctAnswer = options[correctIndex]?.optionText.trim() ?? "";
    if (!correctAnswer) {
      setAiError("請先輸入正解名稱");
      return;
    }
    if (!imageUrl || !croppedAreaPixels) {
      setAiError("請先上傳圖片並框出特寫");
      return;
    }
    if (croppedAreaPixels.width < 32 || croppedAreaPixels.height < 32) {
      setAiError("特寫區域太小，請把框拉大一點");
      return;
    }
    setAiPending(true);
    setAiError("");
    try {
      const cropped = await cropToFile(imageUrl, croppedAreaPixels);
      const cropFile = await compressToWebp(cropped, "crop.webp");
      const imageBase64 = await fileToBase64(cropFile);
      const response = await fetch("/api/ai-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctAnswer,
          imageBase64,
          mimeType: "image/webp",
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        correctTaunt?: string;
        options?: { text?: string; taunt?: string }[];
      };
      if (
        !response.ok ||
        typeof payload.correctTaunt !== "string" ||
        !payload.correctTaunt.trim() ||
        !Array.isArray(payload.options) ||
        payload.options.length !== 3
      ) {
        setAiError(payload.message || "生成失敗，請再試一次");
        return;
      }
      const generated = payload.options;
      const correctTaunt = payload.correctTaunt.trim();
      setOptions((current) => {
        let cursor = 0;
        return current.map((option, index) => {
          if (index === correctIndex) {
            return { ...option, tauntText: correctTaunt };
          }
          const next = generated[cursor];
          cursor += 1;
          if (!next || typeof next.text !== "string" || typeof next.taunt !== "string") {
            return option;
          }
          return { optionText: next.text, tauntText: next.taunt };
        });
      });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "生成失敗，請再試一次");
    } finally {
      setAiPending(false);
    }
  }

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    );
  }

  function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("請上傳圖片檔");
      return;
    }
    setFormError("");
    setResult(null);
    setScoreOpen(false);
    setSourceFile(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1.8);
    setCroppedAreaPixels(null);
    setImageUrl(URL.createObjectURL(file));
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthPending(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setAuthPending(false);
    if (error) setAuthError(readableError(error));
  }

  async function signUp() {
    setAuthError("");
    setAuthMessage("");
    if (password.length < 6) {
      setAuthError("密碼至少 6 個字元");
      return;
    }
    setAuthPending(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setAuthPending(false);
    if (error) {
      setAuthError(readableError(error));
      return;
    }
    if (!data.session) {
      setAuthMessage("註冊成功。請到信箱完成驗證，再回來登入。");
    }
  }

  async function signOut() {
    setAuthError("");
    setAuthMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(readableError(error));
  }

  function validate(): string | null {
    const name = authorName.trim();
    if (name.length < 1 || name.length > 40) {
      return "作者名稱需要 1 到 40 個字";
    }
    if (!sourceFile || !imageUrl) {
      return "請先上傳圖片";
    }
    if (!croppedAreaPixels) {
      return "請等特寫裁切區域準備好";
    }
    if (croppedAreaPixels.width < 32 || croppedAreaPixels.height < 32) {
      return "特寫區域太小，請把框拉大一點";
    }
    for (const [index, option] of options.entries()) {
      const text = option.optionText.trim();
      const taunt = option.tauntText.trim();
      if (text.length < 1 || text.length > 120) {
        return `選項 ${index + 1} 的文字需要 1 到 120 個字`;
      }
      if (taunt.length < 1 || taunt.length > 280) {
        return `選項 ${index + 1} 的吐槽需要 1 到 280 個字`;
      }
    }
    if (correctIndex < 0 || correctIndex >= OPTION_COUNT) {
      return "請標出一個正解";
    }
    return null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setModerationReport(null);

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (!sourceFile || !imageUrl || !croppedAreaPixels) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    const uploaded: string[] = [];
    let questionId = "";
    let saved = false;

    try {
      setBusy(true);
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !currentUser) {
        setFormError("請先登入再出題");
        return;
      }

      setPhase("compressing");

      const cropped = await cropToFile(imageUrl, croppedAreaPixels);
      const cropFile = await compressToWebp(cropped, "crop.webp").catch(() => {
        throw new Error("特寫壓不到 150KB 以內，請把裁切範圍縮小再試");
      });

      setPhase("moderating");
      const correctAnswer = options[correctIndex]?.optionText.trim() ?? "";
      const moderationResponse = await fetch("/api/moderate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctAnswer,
          distractors: options
            .filter((_, index) => index !== correctIndex)
            .map((option) => ({
              text: option.optionText.trim(),
              taunt: option.tauntText.trim(),
            })),
          imageBase64: await fileToBase64(cropFile),
          mimeType: "image/webp",
        }),
      });
      const moderation = (await moderationResponse.json()) as {
        message?: string;
        passed?: boolean;
        quality_score?: number;
        score_breakdown?: ScoreBreakdown;
        guesses?: string[];
        suggestion?: string;
      };
      const review = readReview(moderation);
      if (!moderationResponse.ok || !review) {
        throw new Error(moderation.message || "預審失敗，請再試一次");
      }
      if (!moderation.passed || review.qualityScore < 60 || review.breakdown.safety.violated) {
        setModerationReport(review);
        return;
      }

      const originalFile = await compressToWebp(sourceFile, "original.webp").catch(
        () => {
          throw new Error("原圖壓不到 150KB 以內，請換一張再試");
        },
      );

      questionId = crypto.randomUUID();
      const cropPath = `${currentUser.id}/${questionId}/crop.webp`;
      const originalPath = `${currentUser.id}/${questionId}/original.webp`;

      setPhase("uploading");
      const cropUpload = await supabase.storage
        .from("quiz-images")
        .upload(cropPath, cropFile, {
          contentType: "image/webp",
          upsert: false,
        });
      if (cropUpload.error) throw new Error(cropUpload.error.message);
      uploaded.push(cropPath);

      const originalUpload = await supabase.storage
        .from("quiz-images")
        .upload(originalPath, originalFile, {
          contentType: "image/webp",
          upsert: false,
        });
      if (originalUpload.error) throw new Error(originalUpload.error.message);
      uploaded.push(originalPath);

      setPhase("saving");
      const questionInsert = await supabase.from("questions").insert({
        id: questionId,
        crop_image_path: cropPath,
        original_image_path: originalPath,
        author_id: currentUser.id,
        author_name: authorName.trim(),
        difficulty: "normal",
        status: "active",
        language: "zh-TW",
        quality_score: review.qualityScore,
        score_breakdown: review.breakdown,
        options: options.map((option, index) => ({
          id: index + 1,
          text: option.optionText.trim(),
          is_correct: index === correctIndex,
          taunt: option.tauntText.trim(),
        })),
      });
      if (questionInsert.error) throw new Error(questionInsert.error.message);

      saved = true;
      setScoreOpen(false);
      setResult({
        cropUrl: URL.createObjectURL(cropFile),
        originalUrl: URL.createObjectURL(originalFile),
        cropBytes: cropFile.size,
        originalBytes: originalFile.size,
        qualityScore: review.qualityScore,
        breakdown: review.breakdown,
      });
      setSourceFile(null);
      setImageUrl(null);
      setCroppedAreaPixels(null);
      setOptions(emptyOptions());
      setCorrectIndex(0);
      setAuthorName("");
    } catch (error) {
      if (!saved) {
        if (uploaded.length > 0) {
          await supabase.storage.from("quiz-images").remove(uploaded);
        }
        if (questionId) {
          await supabase.from("questions").delete().eq("id", questionId);
        }
      }
      setFormError(readableError(error));
    } finally {
      submittingRef.current = false;
      setBusy(false);
      setPhase("idle");
    }
  }

  const pending = busy;
  const phaseLabel =
    phase === "compressing"
      ? "壓縮成 WebP…"
      : phase === "moderating"
        ? "綜合審題…"
        : phase === "uploading"
          ? "上傳圖片…"
          : phase === "saving"
            ? "寫入題目…"
            : "發布題目";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            aria-label="返回首頁"
            className="inline-flex h-9 w-fit items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-zinc-950 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
          >
            <span aria-hidden="true">←</span>
            返回首頁
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">出一題局部猜謎</h1>
            <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
              上傳一張圖，框出玩家看得到的特寫。原圖與特寫都會在瀏覽器轉成 150KB
              以內的 WebP 再上傳。
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-950">
          {authReady && user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                已登入 <span className="font-medium">{user.email}</span>
              </p>
              <button
                type="button"
                onClick={signOut}
                className="h-10 rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.08]"
              >
                登出
              </button>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={signIn}>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                登入後才能發布。題目會記在你的帳號下。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  密碼
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!authReady || authPending}
                  className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
                >
                  登入
                </button>
                <button
                  type="button"
                  disabled={!authReady || authPending}
                  onClick={signUp}
                  className="h-10 rounded-full border border-black/10 px-4 text-sm font-medium disabled:opacity-50 dark:border-white/15"
                >
                  註冊
                </button>
              </div>
            </form>
          )}
          {authError ? (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {authError}
            </p>
          ) : null}
          {authMessage ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{authMessage}</p>
          ) : null}
        </section>

        {result ? (
          <section className="rounded-3xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-950">
            <h2 className="text-xl font-semibold">題目已發布</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(result.qualityScore)}`}
              >
                {scoreBadgeText(result.qualityScore)}
              </span>
              <button
                type="button"
                onClick={() => setScoreOpen(true)}
                className="h-9 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08]"
              >
                查看評分明細
              </button>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              特寫 {formatKb(result.cropBytes)}，原圖 {formatKb(result.originalBytes)}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <figure className="flex flex-col gap-2">
                {/* blob: URL from the compressed file; next/image cannot optimize it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.cropUrl}
                  alt="已上傳的特寫"
                  className="aspect-square w-full rounded-2xl object-cover"
                />
                <figcaption className="text-sm text-zinc-500">玩家看到的特寫</figcaption>
              </figure>
              <figure className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.originalUrl}
                  alt="已上傳的原圖"
                  className="aspect-square w-full rounded-2xl object-cover"
                />
                <figcaption className="text-sm text-zinc-500">答對後揭曉的原圖</figcaption>
              </figure>
            </div>
            <button
              type="button"
              onClick={() => {
                setScoreOpen(false);
                setResult(null);
              }}
              className="mt-4 h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              再出一題
            </button>
          </section>
        ) : null}

        {result && scoreOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="score-detail-title"
              className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-5 text-zinc-950 shadow-xl dark:bg-zinc-950 dark:text-zinc-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="score-detail-title" className="text-xl font-semibold">
                    評分明細
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {scoreBadgeText(result.qualityScore)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScoreOpen(false)}
                  className="h-9 rounded-full px-3 text-sm font-medium text-zinc-500 hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                >
                  關閉
                </button>
              </div>
              <ul className="flex flex-col gap-3">
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    盲猜可解性 {result.breakdown.blind_guess.score}/40
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                    {(result.breakdown.ai_guesses.length > 0
                      ? result.breakdown.ai_guesses
                      : result.breakdown.blind_guess.guesses
                    ).map((guess, index) => (
                      <li key={`${guess}-${index}`}>{guess}</li>
                    ))}
                  </ol>
                </li>
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    視覺特徵度 {result.breakdown.visual_richness.score}/25
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {result.breakdown.visual_richness.detail || "尚未留下特徵清晰度評估。"}
                  </p>
                </li>
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    干擾項品質 {result.breakdown.distractor_deception.score}/20
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {result.breakdown.distractor_deception.detail || "尚未留下干擾項評估。"}
                  </p>
                </li>
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    社群合規 {result.breakdown.safety.score}/15 ·{" "}
                    {result.breakdown.safety.violated ? "未通過" : "通過"}
                  </p>
                  {result.breakdown.safety.detail ? (
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {result.breakdown.safety.detail}
                    </p>
                  ) : null}
                </li>
              </ul>
              {result.breakdown.suggestion ? (
                <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm dark:bg-white/10">
                  <span className="font-semibold">AI 建議</span>
                  <span className="mt-1 block">{result.breakdown.suggestion}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <form className="flex flex-col gap-8" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            作者名稱
            <input
              value={authorName}
              maxLength={40}
              onChange={(event) => {
                authorTouched.current = true;
                setAuthorName(event.target.value);
              }}
              placeholder="顯示在題目上的名字"
              className="h-11 rounded-xl border border-black/10 bg-white px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:bg-zinc-950 dark:focus:border-zinc-50"
            />
          </label>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">圖片與特寫</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                拖曳或滾輪拉近，白框裡的範圍就是玩家要猜的局部。
              </p>
            </div>
            <label className="flex h-12 w-fit cursor-pointer items-center rounded-full border border-black/10 px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.08]">
              選擇圖片
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  onPickImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {sourceFile ? (
              <p className="text-sm text-zinc-500">{sourceFile.name}</p>
            ) : null}
            {imageUrl ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="relative h-80 overflow-hidden rounded-2xl bg-black">
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    rotation={0}
                    aspect={1}
                    minZoom={1}
                    maxZoom={6}
                    cropShape="rect"
                    zoomSpeed={1}
                    restrictPosition
                    keyboardStep={1}
                    style={{}}
                    classes={{}}
                    mediaProps={{}}
                    cropperProps={{}}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                  />
                </div>
                <figure className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="原圖預覽"
                    className="aspect-square w-full rounded-2xl object-cover"
                  />
                  <figcaption className="text-sm text-zinc-500">
                    原圖，答對後揭曉
                  </figcaption>
                </figure>
                <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
                  <span className="shrink-0">拉近</span>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={0.01}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
            ) : null}
          </section>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-lg font-semibold">四個選項</legend>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              標一個正解。每個選項都要有專屬吐槽，玩家選到才會看到。
            </p>
            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                disabled={aiPending}
                onClick={() => void generateDistractors()}
                className="h-11 rounded-full border border-black/10 px-4 text-sm font-semibold disabled:opacity-50 dark:border-white/15"
              >
                {aiPending ? "生成中…" : "🤖 AI 一鍵生成干擾項與吐槽"}
              </button>
              {aiError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {aiError}
                </p>
              ) : null}
            </div>
            {options.map((option, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.12] dark:bg-zinc-950"
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={correctIndex === index}
                    onChange={() => setCorrectIndex(index)}
                  />
                  選項 {index + 1}
                  {correctIndex === index ? " · 正解" : ""}
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  選項文字
                  <input
                    value={option.optionText}
                    maxLength={120}
                    onChange={(event) =>
                      updateOption(index, { optionText: event.target.value })
                    }
                    className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  吐槽詞
                  <input
                    value={option.tauntText}
                    maxLength={280}
                    onChange={(event) =>
                      updateOption(index, { tauntText: event.target.value })
                    }
                    className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
                  />
                </label>
              </div>
            ))}
          </fieldset>

          {formError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-12 rounded-full bg-foreground px-5 text-base font-medium text-background disabled:opacity-50"
          >
            {phaseLabel}
          </button>
        </form>
      </main>
      {moderationReport ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-title"
            className="flex w-full max-w-lg flex-col gap-4 rounded-3xl bg-white p-5 text-zinc-950 shadow-xl dark:bg-zinc-950 dark:text-zinc-50"
          >
            <div className="flex flex-col gap-1">
              <h2 id="moderation-title" className="text-xl font-semibold">
                這題還沒通過預審
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {moderationReport.breakdown.safety.violated
                  ? `安全合規未通過，總分已歸零。題目尚未發布。`
                  : `綜合分數 ${moderationReport.qualityScore}/100，未達 60 分。題目尚未發布。`}
                請依盲猜結果重新調整裁切，或修改正解與干擾項後再發布。
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
              <p className="text-sm font-semibold">AI 盲猜結果</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {moderationReport.guesses.map((guess, index) => (
                  <li key={`${guess}-${index}`}>{guess}</li>
                ))}
              </ol>
            </div>
            <ul className="flex flex-col gap-3">
              {(
                [
                  ["盲猜測驗", moderationReport.breakdown.blind_guess],
                  ["視覺特徵", moderationReport.breakdown.visual_richness],
                  ["干擾項欺騙性", moderationReport.breakdown.distractor_deception],
                  ["安全合規", moderationReport.breakdown.safety],
                ] as const
              ).map(([title, slice]) => (
                <li
                  key={title}
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/30 dark:bg-red-500/10"
                >
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    {title} {slice.score}/{slice.max}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{slice.detail}</p>
                </li>
              ))}
            </ul>
            {moderationReport.suggestion ? (
              <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm dark:bg-white/10">
                <span className="font-semibold">改善建議</span>
                <span className="mt-1 block">{moderationReport.suggestion}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setModerationReport(null)}
              className="h-11 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              回去調整
            </button>
            <Link
              href="/guidelines"
              className="text-center text-xs text-zinc-400 transition-colors hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
            >
              查看完整審核標準
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
