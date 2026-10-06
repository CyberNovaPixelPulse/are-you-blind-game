"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { HonorCard } from "@/components/honor-card";
import { commitDraw, drawQuestion, recordAnsweredQuestion } from "@/lib/draw-question";
import { recordQuestionView } from "@/lib/question-views";
import { getMyRank } from "@/lib/leaderboard";
import { readStoredOptions, type QuizOption } from "@/lib/question-options";
import { supabase } from "@/lib/supabase";

const ROUND_MS = 10_000;
const PENDING_KEY = "challenge-pending-score";

type Question = {
  id: string;
  crop_image_path: string;
  original_image_path: string;
  author_name: string;
  options: unknown;
};

type EndReason = "wrong" | "timeout" | "clear";
type SaveState = "idle" | "guest" | "saved" | "error";

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

function publicImageUrl(path: string) {
  return supabase.storage.from("quiz-images").getPublicUrl(path).data.publicUrl;
}

function scoreForRemaining(remainingMs: number) {
  return 1000 + Math.floor(remainingMs * 0.2);
}

function reviewText(streak: number, reason: EndReason) {
  if (reason === "clear") return "題庫被你刷完了";
  if (streak >= 10) return "這反應快得不像人類";
  if (streak >= 6) return "手速已經開始嚇人";
  if (streak >= 3) return "眼神開始銳利了";
  if (streak >= 1) return "開了個頭，下一局可以更快";
  return reason === "timeout" ? "時間到，第一題沒站住" : "第一題就失手了";
}

function clipName(value: string) {
  const text = [...value.trim()].slice(0, 40).join("");
  return text || "玩家";
}

async function playerIdentity(user: User) {
  const profile = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const meta = user.user_metadata ?? {};
  const fromProfile = typeof profile.data?.username === "string" ? profile.data.username : "";
  const fromMeta = String(meta.full_name || meta.name || "");
  const fromEmail = user.email?.split("@")[0] ?? "";
  const avatarValue = profile.data?.avatar_url || meta.avatar_url || meta.picture || null;
  return {
    username: clipName(fromProfile || fromMeta || fromEmail),
    avatarUrl: typeof avatarValue === "string" && avatarValue.trim() ? avatarValue : null,
  };
}

export default function ChallengePage() {
  const [phase, setPhase] = useState<"idle" | "play" | "over">("idle");
  const [question, setQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<QuizOption[]>([]);
  const [remainingMs, setRemainingMs] = useState(ROUND_MS);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [status, setStatus] = useState<"ready" | "loading" | "empty" | "error">("ready");
  const [endReason, setEndReason] = useState<EndReason>("wrong");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [rank, setRank] = useState<number | null>(null);
  const [ladderVersion, setLadderVersion] = useState(0);
  const [ladderRequest, setLadderRequest] = useState(0);
  const [notice, setNotice] = useState("");

  const phaseRef = useRef(phase);
  const endedRef = useRef(false);
  const lockRef = useRef(false);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const roundRef = useRef(0);
  const deadlineRef = useRef(0);
  const questionRef = useRef<Question | null>(null);
  phaseRef.current = phase;
  questionRef.current = question;

  async function recordScore(totalScore: number, streakCount: number, currentUser: User) {
    const identity = await playerIdentity(currentUser);
    const inserted = await supabase.from("challenge_leaderboard").insert({
      user_id: currentUser.id,
      username: identity.username,
      avatar_url: identity.avatarUrl,
      total_score: totalScore,
      streak_count: streakCount,
    });
    if (inserted.error) {
      setSaveState("error");
      return;
    }
    setSaveState("saved");
    const standing = await getMyRank(currentUser.id);
    setRank(standing?.rank ?? null);
    setLadderVersion((current) => current + 1);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        const sessionUser = data.session?.user ?? null;
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!sessionUser || !raw) return;
        sessionStorage.removeItem(PENDING_KEY);
        try {
          const pending = JSON.parse(raw) as { totalScore?: unknown; streak?: unknown };
          const totalScore = pending.totalScore;
          const streakCount = pending.streak;
          if (
            typeof totalScore !== "number" ||
            typeof streakCount !== "number" ||
            !Number.isInteger(totalScore) ||
            !Number.isInteger(streakCount)
          ) {
            return;
          }
          void recordScore(totalScore, streakCount, sessionUser).then(() => {
            setNotice("上一局分數已記入排行榜");
          });
        } catch {
          setNotice("");
        }
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (phase !== "play" || !question) return;
    deadlineRef.current = performance.now() + ROUND_MS;
    setRemainingMs(ROUND_MS);
    let frame = 0;
    const tick = (now: number) => {
      if (endedRef.current || phaseRef.current !== "play") return;
      const left = Math.max(0, deadlineRef.current - now);
      setRemainingMs(left);
      if (left <= 0) {
        finish("timeout");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, question]);

  function finish(reason: EndReason) {
    if (endedRef.current) return;
    endedRef.current = true;
    phaseRef.current = "over";
    lockRef.current = true;
    setEndReason(reason);
    setPhase("over");
    const totalScore = scoreRef.current;
    const streakCount = streakRef.current;
    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      if (!sessionUser) {
        setSaveState("guest");
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ totalScore, streak: streakCount }),
        );
        return;
      }
      void recordScore(totalScore, streakCount, sessionUser);
    });
  }

  async function loadNext() {
    const round = roundRef.current + 1;
    roundRef.current = round;
    lockRef.current = true;
    setStatus("loading");
    setQuestion(null);
    setOptions([]);
    const drawn = await drawQuestion(questionRef.current?.id);
    if (round !== roundRef.current || endedRef.current) return;
    if (drawn.error) {
      setStatus("error");
      return;
    }
    if (!drawn.question) {
      if (scoreRef.current > 0 || streakRef.current > 0) {
        finish("clear");
        return;
      }
      setStatus("empty");
      setPhase("idle");
      phaseRef.current = "idle";
      return;
    }
    commitDraw(drawn);
    recordQuestionView(drawn.question.id);
    deadlineRef.current = performance.now() + ROUND_MS;
    setOptions(shuffle(readStoredOptions(drawn.question.options)));
    setQuestion(drawn.question);
    setStatus("ready");
    lockRef.current = false;
  }

  function start() {
    sessionStorage.removeItem(PENDING_KEY);
    endedRef.current = false;
    lockRef.current = false;
    scoreRef.current = 0;
    streakRef.current = 0;
    roundRef.current += 1;
    setScore(0);
    setStreak(0);
    setRemainingMs(ROUND_MS);
    setRank(null);
    setSaveState("idle");
    setNotice("");
    setQuestion(null);
    setOptions([]);
    phaseRef.current = "play";
    setPhase("play");
    void loadNext();
  }

  function onGuess(option: QuizOption) {
    if (phaseRef.current !== "play" || lockRef.current || endedRef.current || !questionRef.current) return;
    const remaining = Math.max(0, deadlineRef.current - performance.now());
    if (remaining <= 0) {
      finish("timeout");
      return;
    }
    lockRef.current = true;
    const currentId = questionRef.current.id;
    void recordAnsweredQuestion(currentId);
    if (!option.isCorrect) {
      finish("wrong");
      return;
    }
    const gained = scoreForRemaining(remaining);
    const nextScore = scoreRef.current + gained;
    const nextStreak = streakRef.current + 1;
    scoreRef.current = nextScore;
    streakRef.current = nextStreak;
    setScore(nextScore);
    setStreak(nextStreak);
    void loadNext();
  }

  function signInToSave() {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ totalScore: scoreRef.current, streak: streakRef.current }),
    );
    void supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/challenge` },
    });
  }

  const urgent = phase === "play" && question !== null && remainingMs <= 3000;
  const seconds = question ? Math.max(0, Math.ceil(remainingMs / 1000)) : 10;
  const barWidth = phase === "play" && question ? (remainingMs / ROUND_MS) * 100 : phase === "play" ? 100 : 0;
  const showBoard = phase !== "play";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 font-sans text-zinc-950 md:max-w-4xl md:py-10 dark:text-zinc-50">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
        >
          <span aria-hidden="true">←</span>
          返回首頁
        </Link>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span>🔥 {streak}</span>
          <span>{score.toLocaleString("zh-TW")} 分</span>
          <span className={urgent ? "text-red-600 dark:text-red-400" : ""}>{seconds}s</span>
        </div>
      </header>

      <div
        className={`mb-4 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${
          urgent ? "animate-challenge-alarm" : ""
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ROUND_MS}
        aria-valuenow={Math.round(remainingMs)}
        aria-label="剩餘時間"
      >
        <div
          className={`h-full rounded-full ${
            urgent ? "animate-challenge-alarm bg-red-500" : "bg-zinc-950 dark:bg-zinc-50"
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {notice ? <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

      {phase === "idle" ? (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-lg shadow-black/5 dark:border-white/15 dark:bg-zinc-950">
            <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">Challenge</p>
            <h1 className="mt-2 text-3xl font-black">⚡ 挑戰模式</h1>
            <ul className="mt-4 flex flex-col gap-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <li>每題只有 10 秒。</li>
              <li>答對得分是 1000 加上剩餘時間加權，越快越高。</li>
              <li>答錯或時間到，這一局立刻結束。</li>
            </ul>
            <button
              type="button"
              onClick={start}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-zinc-950 text-lg font-bold text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              開始挑戰
            </button>
          </div>
        </section>
      ) : null}

      {phase === "play" ? (
        <div className="flex flex-1 flex-col justify-between gap-6 md:flex-row md:items-center">
          <section className="w-full md:flex-1">
            {status === "loading" ? <p className="py-16 text-center text-sm text-zinc-500">正在抽題…</p> : null}
            {status === "empty" ? (
              <p className="py-10 text-sm text-zinc-600 dark:text-zinc-400">還沒有可以挑戰的題目。</p>
            ) : null}
            {status === "error" ? (
              <p role="alert" className="py-10 text-sm text-red-600">
                題目載入失敗，請再試一次
              </p>
            ) : null}
            {status === "ready" && question ? (
              <div
                className={`relative aspect-square overflow-hidden rounded-3xl border-4 bg-zinc-900 shadow-xl ${
                  urgent ? "animate-challenge-alarm border-red-500" : "border-transparent"
                }`}
              >
                <Image
                  src={publicImageUrl(question.crop_image_path)}
                  alt="這題的特寫"
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-cover"
                />
              </div>
            ) : null}
          </section>
          <section className="flex w-full flex-col gap-3 md:flex-1">
            {status === "ready"
              ? options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onGuess(option)}
                    className="h-16 rounded-2xl border border-black/10 bg-white px-4 text-left text-lg font-medium dark:border-white/15 dark:bg-zinc-950"
                  >
                    {option.text}
                  </button>
                ))
              : null}
            {status === "error" ? (
              <button
                type="button"
                onClick={() => void loadNext()}
                className="h-14 rounded-full bg-zinc-950 text-base font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
              >
                再試一次
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      {showBoard ? (
        <div className="mt-8">
          <HonorCard refreshKey={ladderVersion} openRequest={ladderRequest} />
        </div>
      ) : null}

      {phase === "over" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenge-result-title"
            className="w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-950 shadow-xl dark:bg-zinc-950 dark:text-zinc-50"
          >
            <p className="text-sm font-semibold text-zinc-500">
              {endReason === "timeout" ? "時間到" : endReason === "clear" ? "題庫清空" : "挑戰結束"}
            </p>
            <h2 id="challenge-result-title" className="mt-1 text-2xl font-black">
              最終結算
            </h2>
            <p className="mt-4 text-4xl font-black tracking-tight">{score.toLocaleString("zh-TW")}</p>
            <p className="text-sm text-zinc-500">挑戰總分</p>
            <p className="mt-4 text-xl font-bold">連續答對 {streak} 題</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{reviewText(streak, endReason)}</p>
            {rank ? <p className="mt-3 text-sm font-semibold">目前排行第 {rank} 名</p> : null}
            {saveState === "saved" ? (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">已寫入排行榜</p>
            ) : null}
            {saveState === "error" ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">這局分數還沒寫進排行榜</p>
            ) : null}
            {saveState === "guest" ? (
              <div className="mt-4 rounded-2xl bg-zinc-100 p-3 text-sm dark:bg-white/10">
                <p>登入後就能把這局分數記上排行榜。</p>
                <button
                  type="button"
                  onClick={signInToSave}
                  className="mt-3 h-10 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
                >
                  使用 Google 登入
                </button>
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setLadderRequest((current) => current + 1)}
                className="h-12 rounded-full border border-amber-400/60 text-base font-bold text-amber-800 dark:text-amber-200"
              >
                完整天梯榜 ➔
              </button>
              <button
                type="button"
                onClick={start}
                className="h-12 rounded-full bg-zinc-950 text-base font-bold text-white dark:bg-zinc-50 dark:text-zinc-950"
              >
                再挑戰一次
              </button>
              <Link
                href="/"
                className="flex h-12 items-center justify-center rounded-full border border-black/10 text-base font-semibold dark:border-white/15"
              >
                回到首頁
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
