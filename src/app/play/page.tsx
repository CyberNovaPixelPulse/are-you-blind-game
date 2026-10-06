"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TAUNT_MEME_COUNT, TauntDialog } from "@/components/taunt-meme";
import { commitDraw, drawQuestion, recordAnsweredQuestion } from "@/lib/draw-question";
import { recordQuestionView } from "@/lib/question-views";
import { readStoredOptions, type QuizOption } from "@/lib/question-options";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  crop_image_path: string;
  original_image_path: string;
  author_name: string;
  options: unknown;
};

type Guess = {
  isCorrect: boolean;
  tauntText: string;
};

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
  return supabase.storage.from("quiz-images").getPublicUrl(path).data.publicUrl;
}

function rememberStreak(next: number) {
  sessionStorage.setItem("quiz-streak", String(next));
}

function isStreakMilestone(streak: number) {
  return streak > 0 && [3, 5, 10].some((step) => streak % step === 0);
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
  const [question, setQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<QuizOption[]>([]);
  const [guesses, setGuesses] = useState<Record<string, Guess>>({});
  const [taunt, setTaunt] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [streak, setStreak] = useState(0);
  const [memeIndex, setMemeIndex] = useState(0);
  const requestRef = useRef(0);

  async function loadRound(avoidId?: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus("loading");
    setErrorMessage("");
    setTaunt(null);
    setSolved(false);
    setGuesses({});

    const drawn = await drawQuestion(avoidId);

    if (requestId !== requestRef.current) return;
    if (drawn.error) {
      setStatus("error");
      setErrorMessage("題目載入失敗，請再試一次");
      return;
    }

    if (!drawn.question) {
      setQuestion(null);
      setOptions([]);
      setStatus("empty");
      return;
    }

    commitDraw(drawn);
    recordQuestionView(drawn.question.id);
    setQuestion(drawn.question);
    setOptions(shuffle(readStoredOptions(drawn.question.options)));
    setStatus("ready");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = Number(sessionStorage.getItem("quiz-streak") ?? "0");
      if (Number.isFinite(saved) && saved > 0) setStreak(saved);
      void loadRound();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function onGuess(option: QuizOption) {
    if (!question || solved || taunt) return;

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
      if (isStreakMilestone(nextStreak)) void celebrateMilestone();
      return;
    }
    setStreak(0);
    rememberStreak(0);
    setMemeIndex(Math.floor(Math.random() * TAUNT_MEME_COUNT));
    setTaunt(guess.tauntText);
  }

  const authorName = question?.author_name ?? "";
  const milestone = isStreakMilestone(streak);

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
        <p
          key={streak}
          className={
            milestone
              ? "animate-streak-fire shrink-0 origin-right text-lg font-extrabold"
              : "shrink-0 text-sm font-medium"
          }
        >
          🔥 連勝 {streak} 題
        </p>
      </header>
      <div className="flex flex-1 flex-col justify-between gap-6 md:flex-row md:items-center md:gap-8">
      <section className="flex w-full flex-col gap-4 md:min-w-0 md:flex-1">

        {status === "loading" ? (
          <p className="py-16 text-center text-sm text-zinc-500">正在抽題…</p>
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
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-zinc-900 shadow-xl shadow-black/25">
            <Image
              src={publicImageUrl(question.crop_image_path)}
              alt="這題的特寫"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 480px"
              className={`object-cover transition-opacity duration-500 ${
                solved ? "opacity-0" : "opacity-100"
              }`}
            />
            {solved ? (
              <Image
                src={publicImageUrl(question.original_image_path)}
                alt="揭曉原圖"
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="animate-[quiz-pop_0.45s_ease-out] object-contain"
              />
            ) : null}
            {solved ? (
              <p className="animate-[quiz-pop_0.4s_ease-out] absolute inset-x-4 bottom-4 rounded-full bg-emerald-500 px-4 py-2 text-center text-base font-semibold text-white shadow-lg">
                答對了！
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
              const wrong = Boolean(guess && !guess.isCorrect);
              const correct = Boolean(guess?.isCorrect);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={solved || taunt !== null || wrong}
                  onClick={() => onGuess(option)}
                  className={`h-16 rounded-2xl border px-4 text-left text-lg font-medium ${
                    correct
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : wrong
                        ? "animate-[quiz-shake_0.45s_ease-in-out] border-red-500 bg-red-500 text-white"
                        : "border-black/10 bg-white active:bg-black/[.04] dark:border-white/[.12] dark:bg-zinc-950 dark:active:bg-white/[.06]"
                  }`}
                >
                  {option.text}
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
            onClick={() => void loadRound(question?.id)}
            className="h-16 rounded-full bg-foreground text-lg font-medium text-background"
          >
            再試一次
          </button>
        ) : null}

        {solved && question ? (
          <button
            type="button"
            onClick={() => void loadRound(question.id)}
            className="h-16 rounded-full bg-foreground text-lg font-semibold text-background"
          >
            下一題
          </button>
        ) : null}
      </section>
      </div>

      {taunt && question ? (
        <TauntDialog
          taunt={taunt}
          index={memeIndex}
          questionId={question.id}
          onGiveUp={() => void loadRound(question.id)}
        />
      ) : null}
    </div>
  );
}
