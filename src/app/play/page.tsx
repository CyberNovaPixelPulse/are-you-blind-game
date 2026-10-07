"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdModal, usePlayerVip } from "@/components/ad-modal";
import { SiteFooter } from "@/components/site-footer";
import { QuestionReportButton, TAUNT_MEME_COUNT, TauntDialog } from "@/components/taunt-meme";
import { useLanguage } from "@/components/language-provider";
import { drawQuestions, recordAnsweredQuestion, type DrawnQuestion } from "@/lib/draw-question";
import { quizImageUrl } from "@/lib/quiz-image";
import { recordQuestionView } from "@/lib/question-views";
import { readStoredOptions, type QuizOption } from "@/lib/question-options";
import { rememberSeen, writeSeenIds } from "@/lib/seen-questions";

type Question = DrawnQuestion;

type Guess = {
  isCorrect: boolean;
  tauntText: string;
};

type Miss = {
  id: string;
  text: string;
  tauntText: string;
};

const WRONG_REVEAL_MS = 900;

type QueuedQuestion = {
  question: Question;
  options: QuizOption[];
};

const POOL_SIZE = 5;
const REFILL_BELOW = 2;
const CLASSIC_AD_EVERY = 15;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function publicImageUrl(path: string): string {
  return quizImageUrl(path);
}

function preloadPath(path: string, cache: Set<string>) {
  const url = publicImageUrl(path);
  if (!url || cache.has(url)) return;
  cache.add(url);
  const image = new window.Image();
  image.decoding = "async";
  image.src = url;
}

function preloadQuestion(question: Question | undefined, cache: Set<string>) {
  if (!question) return;
  preloadPath(question.crop_image_path, cache);
  preloadPath(question.original_image_path, cache);
}

function rememberStreak(next: number) {
  sessionStorage.setItem("quiz-streak", String(next));
}

function crossedStreakTier(streak: number) {
  return streak === 3 || streak === 5 || streak === 10;
}

function StreakFlame({ streak, label }: { streak: number; label: string }) {
  if (streak >= 10) {
    return (
      <p className="relative shrink-0">
        <span className="animate-streak-spark absolute -top-1 left-3 h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_#fde68a]" />
        <span className="animate-streak-spark absolute -top-2 right-4 h-1 w-1 rounded-full bg-red-400 [animation-delay:180ms]" />
        <span className="animate-streak-spark absolute top-0 right-1 h-1 w-1 rounded-full bg-orange-300 [animation-delay:360ms]" />
        <span className="animate-streak-inferno inline-flex items-center gap-1 rounded-full border border-amber-200/90 bg-gradient-to-r from-red-600 via-amber-300 to-orange-500 bg-[length:200%_100%] px-3 py-1 text-sm font-black text-red-950 shadow-[0_0_18px_rgba(239,68,68,0.9),0_0_32px_rgba(251,191,36,0.7)]">
          <span className="animate-streak-burn inline-block text-lg" aria-hidden="true">
            🔥
          </span>
          {label}
        </span>
      </p>
    );
  }
  if (streak >= 5) {
    return (
      <p className="inline-flex shrink-0 origin-right items-center gap-1 rounded-full px-2 py-1 text-lg font-extrabold text-orange-600 shadow-[0_0_16px_rgba(249,115,22,0.5)] dark:text-orange-300">
        <span className="animate-streak-burn inline-block" aria-hidden="true">
          🔥
        </span>
        {label}
      </p>
    );
  }
  if (streak >= 3) {
    return (
      <p className="shrink-0 animate-pulse text-sm font-semibold text-orange-600 [filter:drop-shadow(0_0_6px_rgba(249,115,22,0.9))] dark:text-orange-400">
        🔥 {label}
      </p>
    );
  }
  return <p className="shrink-0 text-sm font-medium">🔥 {label}</p>;
}

async function celebrate() {
  const { default: confetti } = await import("canvas-confetti");
  void confetti({ particleCount: 110, spread: 72, origin: { y: 0.62 } });
  window.setTimeout(() => {
    void confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0.1, y: 0.7 } });
    void confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 0.9, y: 0.7 } });
  }, 160);
}

async function celebrateMilestone() {
  const { default: confetti } = await import("canvas-confetti");
  void confetti({
    particleCount: 36,
    spread: 48,
    startVelocity: 26,
    scalar: 0.75,
    origin: { x: 0.84, y: 0.08 },
  });
}

export default function PlayPage() {
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  const [question, setQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<QuizOption[]>([]);
  const [guesses, setGuesses] = useState<Record<string, Guess>>({});
  const [tauntOpen, setTauntOpen] = useState(false);
  const [miss, setMiss] = useState<Miss | null>(null);
  const [solved, setSolved] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [streak, setStreak] = useState(0);
  const [thinLanguage, setThinLanguage] = useState(false);
  const [classicAnsweredCount, setClassicAnsweredCount] = useState(0);
  const [adOpen, setAdOpen] = useState(false);
  const [holdForVip, setHoldForVip] = useState(false);
  const { isVip, vipReady } = usePlayerVip();
  const vipHoldLock = useRef(false);
  const [memeIndex, setMemeIndex] = useState(0);
  const queueRef = useRef<QueuedQuestion[]>([]);
  const questionRef = useRef<Question | null>(null);
  const fillingRef = useRef<Promise<void> | null>(null);
  const refillIdleRef = useRef(false);
  const refillResultRef = useRef<"ok" | "error" | "idle">("ok");
  const imageCacheRef = useRef(new Set<string>());
  const streakLoadedRef = useRef(false);
  const drawGenRef = useRef(0);
  const fillingGenRef = useRef(0);
  questionRef.current = question;

  function preloadUpcoming() {
    preloadQuestion(questionRef.current ?? undefined, imageCacheRef.current);
    preloadQuestion(queueRef.current[0]?.question, imageCacheRef.current);
  }

  function present(item: QueuedQuestion) {
    setTauntOpen(false);
    setMiss(null);
    setSolved(false);
    setGuesses({});
    rememberSeen(item.question.id);
    recordQuestionView(item.question.id);
    questionRef.current = item.question;
    setQuestion(item.question);
    setOptions(item.options);
    setStatus("ready");
    setErrorMessage("");
    preloadUpcoming();
    if (queueRef.current.length < REFILL_BELOW) void refill();
  }

  async function refill() {
    const gen = drawGenRef.current;
    if (refillIdleRef.current && fillingGenRef.current === gen) return refillResultRef.current;
    if (fillingRef.current) {
      const flightGen = fillingGenRef.current;
      await fillingRef.current;
      if (drawGenRef.current !== gen) return "idle" as const;
      if (flightGen === gen) return refillResultRef.current;
    }
    if (drawGenRef.current !== gen) return "idle" as const;
    const task = (async () => {
      const reservedIds = queueRef.current.map((item) => item.question.id);
      const requested = languageRef.current;
      const drawn = await drawQuestions(POOL_SIZE, questionRef.current?.id, reservedIds, requested);
      if (drawGenRef.current !== gen || languageRef.current !== requested) {
        refillResultRef.current = "idle";
        return;
      }
      setThinLanguage(drawn.thinLanguage === true);
      if (drawn.error) {
        refillResultRef.current = "error";
        return;
      }
      const queuedIds = queueRef.current.map((item) => item.question.id);
      if (drawn.resetSeen) {
        writeSeenIds([
          ...drawn.keepIds,
          ...queuedIds,
          ...drawn.questions.map((item) => item.id),
          ...(questionRef.current ? [questionRef.current.id] : []),
        ]);
      }
      const existing = new Set(queuedIds);
      const fresh = drawn.questions.filter((item) => !existing.has(item.id));
      if (fresh.length === 0) {
        refillIdleRef.current = true;
        refillResultRef.current = "idle";
        return;
      }
      queueRef.current = [
        ...queueRef.current,
        ...fresh.map((item) => ({
          question: item,
          options: shuffle(readStoredOptions(item.options)),
        })),
      ];
      refillResultRef.current = "ok";
      preloadUpcoming();
    })();
    fillingGenRef.current = gen;
    fillingRef.current = task;
    try {
      await task;
    } finally {
      if (fillingRef.current === task) fillingRef.current = null;
    }
    return refillResultRef.current;
  }

  async function showNext() {
    const gen = drawGenRef.current;
    refillIdleRef.current = false;
    setTauntOpen(false);
    setMiss(null);
    setSolved(false);
    setGuesses({});
    const next = queueRef.current.shift();
    if (next) {
      if (drawGenRef.current !== gen) return;
      present(next);
      return;
    }
    setStatus("loading");
    setErrorMessage("");
    const outcome = await refill();
    if (drawGenRef.current !== gen) return;
    const queued = queueRef.current.shift();
    if (queued) {
      present(queued);
      return;
    }
    setQuestion(null);
    setOptions([]);
    if (outcome === "error") {
      setStatus("error");
      setErrorMessage("題目載入失敗，請再試一次");
      return;
    }
    setStatus("empty");
  }

  function goNextQuestion() {
    const nextCount = classicAnsweredCount + 1;
    if (nextCount < CLASSIC_AD_EVERY) {
      setClassicAnsweredCount(nextCount);
      void showNext();
      return;
    }
    setClassicAnsweredCount(nextCount);
    if (vipReady && isVip) {
      setClassicAnsweredCount(0);
      void showNext();
      return;
    }
    if (!vipReady) {
      setHoldForVip(true);
      return;
    }
    setAdOpen(true);
  }

  function finishClassicAd() {
    setAdOpen(false);
    setClassicAnsweredCount(0);
    void showNext();
  }

  useEffect(() => {
    if (!holdForVip) {
      vipHoldLock.current = false;
      return;
    }
    if (!vipReady || vipHoldLock.current) return;
    vipHoldLock.current = true;
    setHoldForVip(false);
    if (isVip) {
      setClassicAnsweredCount(0);
      void showNext();
      return;
    }
    setAdOpen(true);
  }, [holdForVip, vipReady, isVip]);

  useEffect(() => {
    languageRef.current = language;
    drawGenRef.current += 1;
    queueRef.current = [];
    refillIdleRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!streakLoadedRef.current) {
        streakLoadedRef.current = true;
        const saved = Number(sessionStorage.getItem("quiz-streak") ?? "0");
        if (Number.isFinite(saved) && saved > 0) setStreak(saved);
      }
      setThinLanguage(false);
      void showNext();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [language]);

  useEffect(() => {
    if (!miss) return;
    const timeout = window.setTimeout(() => setTauntOpen(true), WRONG_REVEAL_MS);
    return () => window.clearTimeout(timeout);
  }, [miss]);

  function onGuess(option: QuizOption) {
    if (!question || solved || miss) return;

    void recordAnsweredQuestion(question.id);
    setErrorMessage("");
    const guess = { isCorrect: option.isCorrect, tauntText: option.tauntText };
    setGuesses((current) => ({ ...current, [option.id]: guess }));
    if (guess.isCorrect) {
      const nextStreak = streak + 1;
      setSolved(true);
      setStreak(nextStreak);
      rememberStreak(nextStreak);
      void celebrate();
      if (crossedStreakTier(nextStreak)) void celebrateMilestone();
      return;
    }
    setStreak(0);
    rememberStreak(0);
    setMemeIndex(Math.floor(Math.random() * TAUNT_MEME_COUNT));
    setMiss({ id: option.id, text: option.text, tauntText: guess.tauntText });
  }

  const authorName = question?.author_name ?? "";
  const showOriginal = solved || miss !== null;
  const answerText = options.find((option) => option.isCorrect)?.text ?? "";

  return (
    <div className="max-w-md mx-auto flex min-h-screen w-full flex-col p-4 font-sans text-zinc-950 md:max-w-4xl md:py-10 dark:text-zinc-50">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="返回首頁"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-zinc-950 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
          >
            <span aria-hidden="true">←</span>
            返回首頁
          </Link>
          <p className="truncate text-sm text-zinc-500">{authorName}</p>
        </div>
        <StreakFlame streak={streak} label={t("streak", { n: streak })} />
      </header>
      {thinLanguage ? (
        <p className="mb-4 rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-300/30 dark:bg-amber-950/40 dark:text-amber-100">
          {t("thinPool")}
        </p>
      ) : null}
      <div className="flex flex-1 flex-col justify-between gap-6 md:flex-row md:items-center md:gap-8">
      <section className="flex w-full flex-col gap-4 md:min-w-0 md:flex-1">

        {status === "loading" ? (
          <p className="py-16 text-center text-sm text-zinc-500">{t("drawing")}</p>
        ) : null}

        {status === "empty" ? (
          <div className="py-10">
            <h1 className="text-xl font-semibold">還沒有題目</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              先上傳一張圖、框出特寫，再回來猜。
            </p>
          </div>
        ) : null}

        {status === "error" ? (
          <p role="alert" className="py-10 text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        ) : null}

        {status === "ready" && question ? (
          <div
            key={question.id}
            className="relative aspect-square w-full overflow-hidden rounded-3xl bg-zinc-900 shadow-xl shadow-black/25"
          >
            {/* 預載用的是同一條公開網址，這裡直接用 img，換題才吃得到瀏覽器快取。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={showOriginal ? "original" : "crop"}
              src={publicImageUrl(showOriginal ? question.original_image_path : question.crop_image_path)}
              alt={showOriginal ? "揭曉原圖" : "這題的特寫"}
              className={
                showOriginal
                  ? "h-full w-full object-contain animate-quiz-reveal"
                  : "h-full w-full object-cover"
              }
            />
            {solved ? (
              <p className="animate-[quiz-pop_0.4s_ease-out] absolute inset-x-4 bottom-4 rounded-full bg-emerald-500 px-4 py-2 text-center text-base font-semibold text-white shadow-lg">
                {t("correct")}
              </p>
            ) : null}
            {miss && !solved ? (
              <p className="absolute inset-x-4 bottom-4 rounded-full bg-red-500 px-4 py-2 text-center text-base font-semibold text-white shadow-lg">
                {t("wrong")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex w-full flex-col gap-3 md:min-w-0 md:flex-1">
        {status === "ready" && question ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {options.map((option) => {
              const guess = guesses[option.id];
              const pickedWrong = miss?.id === option.id;
              const markAnswer = Boolean(miss) && option.isCorrect;
              const pickedRight = Boolean(guess?.isCorrect);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={solved || miss !== null}
                  onClick={() => onGuess(option)}
                  className={`flex h-16 items-center justify-between gap-3 rounded-2xl border px-4 text-left text-lg font-medium ${
                    pickedWrong
                      ? "animate-quiz-shake border-red-500 bg-red-500 text-white"
                      : markAnswer
                        ? "border-emerald-400 bg-emerald-500/15 text-emerald-800 ring-2 ring-emerald-400 dark:text-emerald-100"
                        : pickedRight
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-black/10 bg-white active:bg-black/[.04] dark:border-white/[.12] dark:bg-zinc-950 dark:active:bg-white/[.06]"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.text}</span>
                  {markAnswer ? (
                    <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                      正解
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {errorMessage && status === "ready" ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        ) : null}

        {status === "empty" ? (
          <Link
            href="/create"
            className="flex h-16 items-center justify-center rounded-full bg-foreground text-lg font-medium text-background"
          >
            去出題
          </Link>
        ) : null}

        {status === "error" ? (
          <button
            type="button"
            onClick={() => void showNext()}
            className="h-16 rounded-full bg-foreground text-lg font-medium text-background"
          >
            再試一次
          </button>
        ) : null}

        {solved && question ? (
          <>
            <button
              type="button"
              onClick={goNextQuestion}
              className="h-16 rounded-full bg-foreground text-lg font-semibold text-background"
            >
              {t("next")}
            </button>
            <QuestionReportButton
              questionId={question.id}
              label={`🚩 ${t("report")}`}
              className="text-center text-xs font-medium text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            />
          </>
        ) : null}
      </section>
      </div>

      <SiteFooter className="mt-8" />

      <AdModal open={adOpen} onComplete={finishClassicAd} />

      {tauntOpen && miss && question ? (
        <TauntDialog
          taunt={miss.tauntText}
          pickedText={miss.text}
          answerText={answerText}
          index={memeIndex}
          questionId={question.id}
          cropUrl={publicImageUrl(question.crop_image_path)}
          questionNumber={classicAnsweredCount + 1}
          onGiveUp={goNextQuestion}
        />
      ) : null}
    </div>
  );
}
