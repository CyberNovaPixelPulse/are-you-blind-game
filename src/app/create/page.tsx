"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Area, Point } from "react-easy-crop";
import type { User } from "@supabase/supabase-js";
import { cropToFile, compressCloseupToWebp, compressOriginalImage, cropToAiJpegBase64 } from "@/lib/image";
import type { CreateQuizCopy } from "@/lib/create-copy";
import { isLanguageCode, LANGUAGES, type LanguageCode } from "@/lib/languages";
import { fillTemplate } from "@/lib/ui-sections";
import { useLanguage } from "@/components/language-provider";
import { supabase } from "@/lib/supabase";
import { createBrowserPublication, publicationImage } from "@/lib/publication-browser";
import { PublicationFailure, type PublicationStatus, type PublicationSnapshot } from "@/lib/publication-flow";

const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false });

const OPTION_COUNT = 4;
const AUTHOR_NICKNAME_KEY = "author_nickname";

function readStoredAuthorName() {
  try {
    const value = localStorage.getItem(AUTHOR_NICKNAME_KEY);
    if (typeof value !== "string") return "";
    return value.trim().slice(0, 40);
  } catch {
    return "";
  }
}

function writeStoredAuthorName(name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  try {
    localStorage.setItem(AUTHOR_NICKNAME_KEY, trimmed);
  } catch {
    // Private mode or quota; the in-memory name still stays for this session.
  }
}

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

type AiOptionsPayload = {
  message?: string;
  correctTaunt?: string;
  options?: { text?: string; taunt?: string }[];
};

function aiOptionsReady(
  payload: AiOptionsPayload | null,
  ok: boolean,
): payload is AiOptionsPayload & { correctTaunt: string; options: { text?: string; taunt?: string }[] } {
  return Boolean(
    ok &&
      payload &&
      typeof payload.correctTaunt === "string" &&
      payload.correctTaunt.trim() &&
      Array.isArray(payload.options) &&
      payload.options.length === 3,
  );
}

async function postAiOptions(correctAnswer: string, language: string, imageBase64: string | null) {
  const response = await fetch("/api/ai-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correctAnswer,
      language,
      ...(imageBase64 ? { imageBase64, mimeType: "image/jpeg" } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as AiOptionsPayload | null;
  return { ok: response.ok, payload };
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

function scoreBadgeText(score: number, copy: CreateQuizCopy) {
  if (score >= 85) return `🟢 ${score} ${copy.excellent}`;
  return `🟡 ${score} ${copy.acceptable}`;
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

function readableError(error: unknown, copy: CreateQuizCopy): string {
  const message = error instanceof Error ? error.message : copy.publishFail;
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return copy.badCredentials;
  }
  if (normalized.includes("email not confirmed")) {
    return copy.emailUnconfirmed;
  }
  if (normalized.includes("row-level security") || normalized.includes("jwt")) {
    return copy.noPermission;
  }
  if (
    normalized.includes("maximum allowed size") ||
    normalized.includes("payload too large")
  ) {
    return copy.tooLarge;
  }
  return message;
}

export default function CreatePage() {
  const { language, t } = useLanguage();
  const copy = t.createQuiz;
  const [targetOverride, setTargetOverride] = useState<LanguageCode | null>(null);
  const targetLanguage = targetOverride ?? language;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authPending, setAuthPending] = useState(false);

  const [authorName, setAuthorName] = useState("");
  const authorTouched = useRef(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.8);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>(emptyOptions);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "compressing" | "moderating" | "uploading" | "saving" | "confirming" | "cancelling"
  >("idle");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const publicationRef = useRef<{
    flow: ReturnType<typeof createBrowserPublication>; crop: File; original: File; authorName: string; review?: ModerationReport;
  } | null>(null);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus | null>(null);
  const cancellingRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [publicationFrozen, setPublicationFrozen] = useState(false);
  const [formError, setFormError] = useState("");
  const [moderationReport, setModerationReport] = useState<ModerationReport | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredAuthorName();
    if (!stored) return;
    authorTouched.current = true;
    setAuthorName(stored);
  }, []);

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
      setAuthorName(copy.anonymousAuthor);
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
        setAuthorName((fromProfile || fromMeta || fromEmail || copy.anonymousAuthor).slice(0, 40));
      });

    return () => {
      active = false;
    };
  }, [authReady, user, copy.anonymousAuthor]);

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
      setAiError(copy.needAnswer);
      return;
    }
    if (!imageUrl || !croppedAreaPixels) {
      setAiError(copy.needCrop);
      return;
    }
    if (croppedAreaPixels.width < 32 || croppedAreaPixels.height < 32) {
      setAiError(copy.cropTooSmall);
      return;
    }
    setAiPending(true);
    setAiError("");
    try {
      const imageBase64 = await cropToAiJpegBase64(imageUrl, croppedAreaPixels);
      const posted = await postAiOptions(correctAnswer, targetLanguage, imageBase64);
      const recovered =
        imageBase64 && !aiOptionsReady(posted.payload, posted.ok)
          ? await postAiOptions(correctAnswer, targetLanguage, null)
          : posted;
      const payload = recovered.payload;
      if (!aiOptionsReady(payload, recovered.ok)) {
        setAiError(payload?.message || copy.aiFailed);
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
      setAiError(error instanceof Error ? error.message : copy.aiFailed);
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
      setFormError(copy.notImage);
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
    if (error) setAuthError(readableError(error, copy));
  }

  async function signUp() {
    setAuthError("");
    setAuthMessage("");
    if (password.length < 6) {
      setAuthError(copy.passwordShort);
      return;
    }
    setAuthPending(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setAuthPending(false);
    if (error) {
      setAuthError(readableError(error, copy));
      return;
    }
    if (!data.session) {
      setAuthMessage(copy.signedUp);
    }
  }

  async function signOut() {
    setAuthError("");
    setAuthMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(readableError(error, copy));
  }

  function validate(): string | null {
    const name = authorName.trim();
    if (name.length < 1 || name.length > 40) {
      return copy.authorLength;
    }
    if (!sourceFile || !imageUrl) {
      return copy.needImage;
    }
    if (!croppedAreaPixels) {
      return copy.cropPending;
    }
    if (croppedAreaPixels.width < 32 || croppedAreaPixels.height < 32) {
      return copy.cropTooSmall;
    }
    for (const [index, option] of options.entries()) {
      const text = option.optionText.trim();
      const taunt = option.tauntText.trim();
      if (text.length < 1 || text.length > 120) {
        return fillTemplate(copy.optionLength, { n: index + 1 });
      }
      if (taunt.length < 1 || taunt.length > 280) {
        return fillTemplate(copy.tauntLength, { n: index + 1 });
      }
    }
    if (correctIndex < 0 || correctIndex >= OPTION_COUNT) {
      return copy.needCorrect;
    }
    return null;
  }

  function showPublicationOutcome(outcome: PublicationStatus) {
    setPublicationStatus(outcome);
    const current = publicationRef.current;
    if (outcome.state !== "published" || !current) return;
    // The server result is final even if local preview preparation fails.
    setFormError("");
    writeStoredAuthorName(current.authorName);
    authorTouched.current = true;
    setScoreOpen(false);
    if (current.review) {
      try {
        setResult({cropUrl: URL.createObjectURL(current.crop), originalUrl: URL.createObjectURL(current.original),
          cropBytes:current.crop.size,originalBytes:current.original.size,
          qualityScore:outcome.result!.quality_score,breakdown:current.review.breakdown});
      } catch { /* The published status remains visible without a local preview. */ }
    }
    setSourceFile(null); setImageUrl(null); setCroppedAreaPixels(null);
    setOptions(emptyOptions()); setCorrectIndex(0);
  }

  async function cancelPublication() {
    const current = publicationRef.current;
    if (!current || cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(true);
    try {
      const outcome = await current.flow.cancel();
      if (publicationRef.current !== current) return;
      showPublicationOutcome(outcome);
      if (outcome.state === "cancelled" || outcome.state === "published") {
        submittingRef.current = false;
        setBusy(false);
        setPhase("idle");
      }
    } finally { cancellingRef.current = false; setCancelling(false); }
  }

  async function resumePublication(confirmOnly: boolean) {
    const current = publicationRef.current;
    if (submittingRef.current || !current) return;
    submittingRef.current = true; setBusy(true);
    try {
      const outcome = await (confirmOnly ? current.flow.confirm() : current.flow.run());
      if (publicationRef.current === current) showPublicationOutcome(outcome);
    } catch { if (publicationRef.current === current) setPublicationStatus({state:"unknown",message:"發布結果尚未確認，請再次確認"}); }
    finally { if (publicationRef.current === current) { submittingRef.current=false;setBusy(false);setPhase("idle"); } }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (publicationRef.current) { await resumePublication(false); return; }
    setFormError(""); setModerationReport(null);
    const validationError=validate();
    if(validationError){setFormError(validationError);return;}
    if(!sourceFile || !imageUrl || !croppedAreaPixels || submittingRef.current) return;
    const draft={authorName:authorName.trim(),language:targetLanguage,cropArea:{...croppedAreaPixels},
      options:options.map((option,index)=>({text:option.optionText.trim(),is_correct:index===correctIndex,taunt:option.tauntText.trim()}))};
    submittingRef.current=true;setBusy(true);
    let submittedFlow: ReturnType<typeof createBrowserPublication> | undefined;
    try {
      const getToken=async()=>{
        const session=await supabase.auth.getSession();
        const token=session.data.session?.access_token;
        if(!token) throw new Error(copy.needLogin);
        return token;
      };
      await getToken();
      setPhase("compressing");
      const crop=await compressCloseupToWebp(await cropToFile(imageUrl,draft.cropArea));
      const original=await compressOriginalImage(sourceFile);
      const snapshot:PublicationSnapshot={...draft,crop:await publicationImage(crop),original:await publicationImage(original)};
      const id=crypto.randomUUID();
      const flow=createBrowserPublication({id,snapshot,crop,original,getToken,onPhase:next=>{if(publicationRef.current?.flow===flow)setPhase(next);},
        review:async (questionId,fixed)=>{
          const correct=fixed.options.find(o=>o.is_correct)!;
          const response=await fetch("/api/moderate-quiz",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await getToken()}`},
            body:JSON.stringify({questionId,correctAnswer:correct.text,distractors:fixed.options.filter(o=>!o.is_correct).map(({text,taunt})=>({text,taunt})),
              imageBase64:await fileToBase64(crop),mimeType:crop.type})});
          const moderation=await response.json() as {message?:string;passed?:boolean;attestation?:string;quality_score?:number;score_breakdown?:ScoreBreakdown;guesses?:string[];suggestion?:string};
          const review=readReview(moderation);
          if(!response.ok || !review) throw new Error(moderation.message || copy.reviewFail);
          if(!moderation.passed || review.qualityScore<60 || review.breakdown.safety.violated){
            if(publicationRef.current?.flow===flow)setModerationReport(review);throw new PublicationFailure(copy.reviewFail,"rejected");
          }
          if(!moderation.attestation) throw new PublicationFailure("審核證明無效，請重新審核","needs-review");
          if(publicationRef.current?.flow===flow) publicationRef.current.review=review;
          return moderation.attestation;
        }});
      submittedFlow=flow;
      publicationRef.current={flow,crop,original,authorName:draft.authorName};
      setPublicationStatus({state:"pending"});
      setTargetOverride(draft.language);
      setPublicationFrozen(true);
      const outcome=await flow.run();
      if(publicationRef.current?.flow===flow)showPublicationOutcome(outcome);
    } catch(error) {if(!submittedFlow || publicationRef.current?.flow===submittedFlow)setFormError(readableError(error,copy));}
    finally {if(!submittedFlow || publicationRef.current?.flow===submittedFlow){submittingRef.current=false;setBusy(false);setPhase("idle");}}
  }

  const pending = busy || publicationFrozen;
  const phaseLabel =
    phase === "compressing"
      ? copy.compressing
      : phase === "moderating"
        ? copy.moderating
        : phase === "uploading"
          ? copy.uploading
          : phase === "saving"
            ? copy.saving
            : copy.publish;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            aria-label={copy.backHome}
            className="inline-flex h-9 w-fit items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-zinc-950 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
          >
            <span aria-hidden="true">←</span>
            {copy.backHome}
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="max-w-xl text-zinc-600 dark:text-zinc-400">{copy.intro}</p>
            <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-500">
              {copy.quizLanguage}
              <select
                disabled={busy || publicationFrozen}
                value={targetLanguage}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isLanguageCode(next)) setTargetOverride(next);
                }}
                className="h-10 rounded-xl border border-black/10 bg-white px-3 font-medium text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.flag} {item.nativeName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="rounded-3xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-950">
          {authReady && user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {copy.signedIn} <span className="font-medium">{user.email}</span>
              </p>
              <button
                type="button"
                onClick={signOut}
                className="h-10 rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.08]"
              >
                {copy.signOut}
              </button>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={signIn}>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{copy.signInHint}</p>
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
                  {copy.password}
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
                  {t("login")}
                </button>
                <button
                  type="button"
                  disabled={!authReady || authPending}
                  onClick={signUp}
                  className="h-10 rounded-full border border-black/10 px-4 text-sm font-medium disabled:opacity-50 dark:border-white/15"
                >
                  {copy.signUp}
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
            <h2 className="text-xl font-semibold">{copy.published}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(result.qualityScore)}`}
              >
                {scoreBadgeText(result.qualityScore, copy)}
              </span>
              <button
                type="button"
                onClick={() => setScoreOpen(true)}
                className="h-9 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08]"
              >
                {copy.viewScore}
              </button>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {fillTemplate(copy.sizeLine, {
                crop: formatKb(result.cropBytes),
                original: formatKb(result.originalBytes),
              })}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <figure className="flex flex-col gap-2">
                {/* blob: URL from the compressed file; next/image cannot optimize it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.cropUrl}
                  alt={copy.cropAlt}
                  className="aspect-square w-full rounded-2xl object-cover"
                />
                <figcaption className="text-sm text-zinc-500">{copy.cropCaption}</figcaption>
              </figure>
              <figure className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.originalUrl}
                  alt={copy.originalAlt}
                  className="aspect-square w-full rounded-2xl object-cover"
                />
                <figcaption className="text-sm text-zinc-500">{copy.originalCaption}</figcaption>
              </figure>
            </div>
            <button
              type="button"
              onClick={() => {
                setScoreOpen(false);
                setResult(null);
                publicationRef.current=null;setPublicationFrozen(false);setPublicationStatus(null);
              }}
              className="mt-4 h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              {copy.another}
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
                    {copy.scoreTitle}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {scoreBadgeText(result.qualityScore, copy)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScoreOpen(false)}
                  className="h-9 rounded-full px-3 text-sm font-medium text-zinc-500 hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                >
                  {copy.close}
                </button>
              </div>
              <ul className="flex flex-col gap-3">
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    {copy.blindSolve} {result.breakdown.blind_guess.score}/40
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
                    {copy.visualRich} {result.breakdown.visual_richness.score}/25
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {result.breakdown.visual_richness.detail || copy.noVisual}
                  </p>
                </li>
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    {copy.distractorQuality} {result.breakdown.distractor_deception.score}/20
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {result.breakdown.distractor_deception.detail || copy.noDistractor}
                  </p>
                </li>
                <li className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
                  <p className="text-sm font-semibold">
                    {copy.community} {result.breakdown.safety.score}/15 ·{" "}
                    {result.breakdown.safety.violated ? copy.failedCheck : copy.passed}
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
                  <span className="font-semibold">{copy.aiSuggestion}</span>
                  <span className="mt-1 block">{result.breakdown.suggestion}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {publicationStatus ? (
          <section aria-label="發布狀態" className="rounded-2xl border p-4">
            <p role="status">{publicationStatus.state === "cancelled" ? "已取消，暫存圖片將由系統清理。" : publicationStatus.state === "published" ? "題目已發布" : publicationStatus.state === "unknown" ? "正在確認發布結果" : publicationStatus.message || "本次內容已固定，可繼續這次發布"}</p>
            {!["published","cancelled"].includes(publicationStatus.state) ? <button type="button" disabled={busy} onClick={()=>void resumePublication(true)}>再次確認</button> : null}
            {!["published","cancelled"].includes(publicationStatus.state) ? <button type="button" disabled={cancelling} onClick={()=>void cancelPublication()}>取消這次發布</button> : null}
            {publicationStatus.state === "cancelled" ? <button type="button" onClick={()=>{publicationRef.current=null;setPublicationFrozen(false);setPublicationStatus(null);setPhase("idle");}}>繼續出題</button> : null}
            {publicationStatus.state === "pending" ? <button type="button" disabled={busy} onClick={()=>void resumePublication(false)}>繼續這次發布</button> : null}
            {publicationStatus.state === "published" && !result ? <button type="button" onClick={()=>{publicationRef.current=null;setPublicationFrozen(false);setPublicationStatus(null);}}>建立另一題</button> : null}
          </section>
        ) : null}
        {cancelling ? <p role="status">正在確認取消結果</p> : null}
        {phase === "confirming" ? <p role="status">正在確認發布結果</p> : null}
        <form className="flex flex-col gap-8" onSubmit={onSubmit}>
        <fieldset disabled={pending} className="flex min-w-0 flex-col gap-8">
          <label className="flex flex-col gap-2 text-sm font-medium">
            {copy.authorLabel}
            <input
              value={authorName}
              maxLength={40}
              onChange={(event) => {
                authorTouched.current = true;
                setAuthorName(event.target.value);
                writeStoredAuthorName(event.target.value);
              }}
              placeholder={copy.authorPlaceholder}
              className="h-11 rounded-xl border border-black/10 bg-white px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:bg-zinc-950 dark:focus:border-zinc-50"
            />
          </label>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{copy.imageTitle}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{copy.imageHint}</p>
            </div>
            <label className="flex h-12 w-fit cursor-pointer items-center rounded-full border border-black/10 px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.08]">
              {copy.pickImage}
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
                    alt={copy.originalPreviewAlt}
                    className="aspect-square w-full rounded-2xl object-cover"
                  />
                  <figcaption className="text-sm text-zinc-500">
                    {copy.originalReveal}
                  </figcaption>
                </figure>
                <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
                  <span className="shrink-0">{copy.zoom}</span>
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
            <legend className="text-lg font-semibold">{copy.optionsTitle}</legend>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{copy.optionsHint}</p>
            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                disabled={aiPending}
                onClick={() => void generateDistractors()}
                className="h-11 rounded-full border border-black/10 px-4 text-sm font-semibold disabled:opacity-50 dark:border-white/15"
              >
                {aiPending ? copy.aiPending : copy.aiButton}
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
                  {fillTemplate(correctIndex === index ? copy.optionCorrect : copy.optionN, {
                    n: index + 1,
                  })}
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {copy.optionText}
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
                  {copy.tauntLabel}
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
        </fieldset>
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
                {copy.moderationTitle}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {moderationReport.breakdown.safety.violated
                  ? copy.safetyZero
                  : fillTemplate(copy.scoreLow, { score: moderationReport.qualityScore })}{" "}
                {copy.adjustHint}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
              <p className="text-sm font-semibold">{copy.blindResult}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {moderationReport.guesses.map((guess, index) => (
                  <li key={`${guess}-${index}`}>{guess}</li>
                ))}
              </ol>
            </div>
            <ul className="flex flex-col gap-3">
              {(
                [
                  [copy.blindTest, moderationReport.breakdown.blind_guess],
                  [copy.visualShort, moderationReport.breakdown.visual_richness],
                  [copy.deception, moderationReport.breakdown.distractor_deception],
                  [copy.safetyShort, moderationReport.breakdown.safety],
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
                <span className="font-semibold">{copy.improve}</span>
                <span className="mt-1 block">{moderationReport.suggestion}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setModerationReport(null)}
              className="h-11 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              {copy.backAdjust}
            </button>
            <Link
              href="/guidelines"
              className="text-center text-xs text-zinc-400 transition-colors hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
            >
              {copy.guidelines}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
