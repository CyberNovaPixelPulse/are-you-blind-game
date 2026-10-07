"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdModal, usePlayerVip } from "@/components/ad-modal";
import { ShareShameButton } from "@/components/battle-report-card";
import { SiteFooter } from "@/components/site-footer";
import type { User } from "@supabase/supabase-js";
import { HonorCard } from "@/components/honor-card";
import { useLanguage } from "@/components/language-provider";
import { drawQuestions, recordAnsweredQuestion, type DrawnQuestion } from "@/lib/draw-question";
import { recordQuestionView } from "@/lib/question-views";
import { getMyRank } from "@/lib/leaderboard";
import { readStoredOptions, type QuizOption } from "@/lib/question-options";
import { quizImageUrl } from "@/lib/quiz-image";
import { rememberSeen, writeSeenIds } from "@/lib/seen-questions";
import { supabase } from "@/lib/supabase";

const ROUND_MS = 10_000;
const INITIAL_POOL = 10;
const REFILL_BELOW = 3;
const PENDING_KEY = "challenge-pending-score";
const CHALLENGE_GAMES_KEY = "challengeGamesPlayed";
const CHALLENGE_AD_EVERY = 3;

function readChallengeGames() {
  const value = Number(window.localStorage.getItem(CHALLENGE_GAMES_KEY) ?? "0");
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

type Question = DrawnQuestion;

type QueuedQuestion = {
  question: Question;
  options: QuizOption[];
};

type PoolOutcome = "ok" | "empty" | "error" | "stale";

type EndReason = "wrong" | "timeout" | "clear";
type SaveState = "idle" | "guest" | "saved" | "error";
type ShameCard = {
  cropUrl: string;
  pickedText: string;
  answerText: string;
  taunt: string;
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

function publicImageUrl(path: string) {
  return quizImageUrl(path);
}

function refillBatchSize() {
  return 5 + Math.floor(Math.random() * 4);
}

function preloadImage(src: string, cache: Set<string>) {
  if (!src || cache.has(src)) return;
  cache.add(src);
  const image = new window.Image();
  image.decoding = "async";
  image.src = src;
}

function imageReady(src: string) {
  if (!src) return false;
  const image = new window.Image();
  image.src = src;
  return image.complete && image.naturalWidth > 0;
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
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const router = useRouter();
  const { isVip, vipReady } = usePlayerVip();
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
  const [challengeGamesPlayed, setChallengeGamesPlayed] = useState(0);
  const [adOpen, setAdOpen] = useState(false);
  const [shame, setShame] = useState<ShameCard | null>(null);
  const [timedId, setTimedId] = useState<string | null>(null);
  const pendingLeave = useRef<"restart" | "home" | null>(null);
  const roundShot = useRef<{ cropUrl: string; answerText: string } | null>(null);
  const questionsQueue = useRef<QueuedQuestion[]>([]);
  const currentIndexRef = useRef(-1);
  const imageCacheRef = useRef(new Set<string>());
  const poolGenRef = useRef(0);
  const fillingRef = useRef<Promise<void> | null>(null);
  const fillingGenRef = useRef(0);
  const poolResultRef = useRef<PoolOutcome>("ok");
  const refillIdleRef = useRef(false);
  const clockArmedRef = useRef<string | null>(null);

  const phaseRef = useRef(phase);
  const endedRef = useRef(false);
  const lockRef = useRef(false);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const deadlineRef = useRef(0);
  const questionRef = useRef<Question | null>(null);
  phaseRef.current = phase;
  questionRef.current = question;

  useEffect(() => {
    if (phaseRef.current !== "idle") return;
    const gen = ++poolGenRef.current;
    questionsQueue.current = [];
    currentIndexRef.current = -1;
    refillIdleRef.current = false;
    imageCacheRef.current = new Set();
    void refill(INITIAL_POOL);
    return () => {
      if (phaseRef.current !== "idle") return;
      if (poolGenRef.current === gen) poolGenRef.current += 1;
    };
  }, [language]);

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
    if (phase !== "play" || !question || timedId !== question.id) return;
    if (deadlineRef.current <= performance.now()) {
      deadlineRef.current = performance.now() + ROUND_MS;
    }
    setRemainingMs(Math.max(0, deadlineRef.current - performance.now()));
    let frame = 0;
    const tick = (now: number) => {
      if (endedRef.current || phaseRef.current !== "play" || questionRef.current?.id !== question.id) return;
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
  }, [phase, question, timedId]);

  function finish(reason: EndReason, miss?: { text: string; taunt: string }) {
    if (endedRef.current) return;
    endedRef.current = true;
    phaseRef.current = "over";
    lockRef.current = true;
    setEndReason(reason);
    setPhase("over");
    const shot = roundShot.current;
    if (shot?.cropUrl) {
      setShame({
        cropUrl: shot.cropUrl,
        answerText: shot.answerText || "沒有標出正解",
        pickedText: miss?.text ?? (reason === "timeout" ? "時間到，沒按下去" : "這局沒有失手"),
        taunt: miss?.taunt ?? (reason === "timeout" ? "時間到，這題你連猜都沒猜。" : "題庫先被你刷完了。"),
      });
    }
    if (reason === "timeout" || reason === "wrong") {
      const played = readChallengeGames() + 1;
      window.localStorage.setItem(CHALLENGE_GAMES_KEY, String(played));
      setChallengeGamesPlayed(played);
    }
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

  function preloadAround(index: number) {
    for (const offset of [1, 2]) {
      const upcoming = questionsQueue.current[index + offset]?.question;
      if (!upcoming) continue;
      preloadImage(publicImageUrl(upcoming.crop_image_path), imageCacheRef.current);
      preloadImage(publicImageUrl(upcoming.original_image_path), imageCacheRef.current);
    }
  }

  function preloadOpeningCrops() {
    for (const item of questionsQueue.current.slice(0, 3)) {
      preloadImage(publicImageUrl(item.question.crop_image_path), imageCacheRef.current);
    }
  }

  function armClock(id: string) {
    if (endedRef.current || phaseRef.current !== "play") return;
    if (questionRef.current?.id !== id || clockArmedRef.current === id) return;
    clockArmedRef.current = id;
    deadlineRef.current = performance.now() + ROUND_MS;
    setRemainingMs(ROUND_MS);
    setTimedId(id);
  }

  function present(index: number) {
    const item = questionsQueue.current[index];
    if (!item) return false;
    currentIndexRef.current = index;
    lockRef.current = false;
    clockArmedRef.current = null;
    deadlineRef.current = 0;
    setTimedId(null);
    setRemainingMs(ROUND_MS);
    const correct = item.options.find((option) => option.isCorrect);
    roundShot.current = {
      cropUrl: publicImageUrl(item.question.crop_image_path),
      answerText: correct?.text ?? "",
    };
    rememberSeen(item.question.id);
    recordQuestionView(item.question.id);
    questionRef.current = item.question;
    setQuestion(item.question);
    setOptions(item.options);
    setStatus("ready");
    preloadAround(index);
    const cropUrl = publicImageUrl(item.question.crop_image_path);
    if (imageReady(cropUrl)) armClock(item.question.id);
    if (questionsQueue.current.length - index - 1 < REFILL_BELOW) void refill(refillBatchSize());
    return true;
  }

  async function refill(count: number) {
    const gen = poolGenRef.current;
    if (refillIdleRef.current && fillingGenRef.current === gen) return "empty" as const;
    if (fillingRef.current) {
      const flightGen = fillingGenRef.current;
      await fillingRef.current;
      if (poolGenRef.current !== gen) return "stale" as const;
      if (flightGen === gen) return poolResultRef.current;
    }
    if (poolGenRef.current !== gen || (refillIdleRef.current && fillingGenRef.current === gen)) {
      return poolGenRef.current === gen ? "empty" : "stale";
    }
    const task = (async () => {
      const requested = languageRef.current;
      const reservedIds = questionsQueue.current.map((item) => item.question.id);
      const drawn = await drawQuestions(count, questionRef.current?.id, reservedIds, requested);
      if (poolGenRef.current !== gen || languageRef.current !== requested) {
        poolResultRef.current = "stale";
        return;
      }
      if (drawn.error) {
        poolResultRef.current = "error";
        return;
      }
      const queuedIds = questionsQueue.current.map((item) => item.question.id);
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
        poolResultRef.current = "empty";
        return;
      }
      const wasEmpty = questionsQueue.current.length === 0;
      questionsQueue.current = [
        ...questionsQueue.current,
        ...fresh.map((item) => ({
          question: item,
          options: shuffle(readStoredOptions(item.options)),
        })),
      ];
      poolResultRef.current = "ok";
      if (wasEmpty || currentIndexRef.current < 0) preloadOpeningCrops();
      else preloadAround(currentIndexRef.current);
    })();
    fillingGenRef.current = gen;
    fillingRef.current = task;
    try {
      await task;
    } finally {
      if (fillingRef.current === task) fillingRef.current = null;
    }
    return poolResultRef.current;
  }

  function showNoQuestion(outcome: PoolOutcome) {
    if (scoreRef.current > 0 || streakRef.current > 0) {
      finish("clear");
      return;
    }
    setQuestion(null);
    setOptions([]);
    setTimedId(null);
    setStatus(outcome === "error" ? "error" : "empty");
    if (outcome !== "error") {
      phaseRef.current = "idle";
      setPhase("idle");
    }
  }

  async function beginRound() {
    const gen = poolGenRef.current;
    const upcoming = questionsQueue.current.slice(currentIndexRef.current + 1);
    questionsQueue.current = upcoming;
    currentIndexRef.current = -1;
    if (questionsQueue.current.length === 0) {
      setStatus("loading");
      const outcome = await refill(INITIAL_POOL);
      if (endedRef.current || phaseRef.current !== "play" || poolGenRef.current !== gen) return;
      if (!questionsQueue.current.length) {
        showNoQuestion(outcome);
        return;
      }
    }
    preloadOpeningCrops();
    present(0);
  }

  function start() {
    sessionStorage.removeItem(PENDING_KEY);
    endedRef.current = false;
    lockRef.current = false;
    scoreRef.current = 0;
    streakRef.current = 0;
    clockArmedRef.current = null;
    deadlineRef.current = 0;
    refillIdleRef.current = false;
    setScore(0);
    setStreak(0);
    setRemainingMs(ROUND_MS);
    setRank(null);
    setSaveState("idle");
    setNotice("");
    setTimedId(null);
    setShame(null);
    phaseRef.current = "play";
    setPhase("play");
    setStatus(questionsQueue.current.length > currentIndexRef.current + 1 ? "ready" : "loading");
    void beginRound();
  }

  async function advance() {
    const nextIndex = currentIndexRef.current + 1;
    if (questionsQueue.current[nextIndex]) {
      present(nextIndex);
      return;
    }
    lockRef.current = true;
    clockArmedRef.current = null;
    deadlineRef.current = 0;
    setTimedId(null);
    const outcome = await refill(refillBatchSize());
    if (endedRef.current || phaseRef.current !== "play") return;
    if (questionsQueue.current[nextIndex]) {
      present(nextIndex);
      return;
    }
    showNoQuestion(outcome);
  }

  async function retryLoad() {
    refillIdleRef.current = false;
    setStatus("loading");
    const outcome = await refill(questionsQueue.current.length === 0 ? INITIAL_POOL : refillBatchSize());
    if (endedRef.current || phaseRef.current !== "play") return;
    const index = currentIndexRef.current < 0 ? 0 : currentIndexRef.current;
    if (questionsQueue.current[index]) {
      present(index);
      return;
    }
    showNoQuestion(outcome);
  }

  function onGuess(option: QuizOption) {
    if (phaseRef.current !== "play" || lockRef.current || endedRef.current || !questionRef.current) return;
    if (clockArmedRef.current !== questionRef.current.id) return;
    const remaining = Math.max(0, deadlineRef.current - performance.now());
    if (remaining <= 0) {
      finish("timeout");
      return;
    }
    lockRef.current = true;
    const currentId = questionRef.current.id;
    void recordAnsweredQuestion(currentId);
    if (!option.isCorrect) {
      finish("wrong", { text: option.text, taunt: option.tauntText });
      return;
    }
    const gained = scoreForRemaining(remaining);
    const nextScore = scoreRef.current + gained;
    const nextStreak = streakRef.current + 1;
    scoreRef.current = nextScore;
    streakRef.current = nextStreak;
    setScore(nextScore);
    setStreak(nextStreak);
    void advance();
  }

  function runLeave(action: "restart" | "home") {
    if (action === "home") {
      router.push("/");
      return;
    }
    start();
  }

  function leaveChallenge(action: "restart" | "home") {
    if (challengeGamesPlayed !== CHALLENGE_AD_EVERY && readChallengeGames() !== CHALLENGE_AD_EVERY) {
      runLeave(action);
      return;
    }
    if (vipReady && isVip) {
      window.localStorage.setItem(CHALLENGE_GAMES_KEY, "0");
      setChallengeGamesPlayed(0);
      runLeave(action);
      return;
    }
    pendingLeave.current = action;
    if (!vipReady) return;
    setAdOpen(true);
  }

  function finishChallengeAd() {
    window.localStorage.setItem(CHALLENGE_GAMES_KEY, "0");
    setChallengeGamesPlayed(0);
    setAdOpen(false);
    const action = pendingLeave.current;
    pendingLeave.current = null;
    if (action) runLeave(action);
  }

  useEffect(() => {
    const played = readChallengeGames();
    setChallengeGamesPlayed(played);
  }, []);

  useEffect(() => {
    if (!pendingLeave.current || !vipReady || adOpen) return;
    if (readChallengeGames() !== CHALLENGE_AD_EVERY) return;
    if (isVip) {
      const action = pendingLeave.current;
      pendingLeave.current = null;
      window.localStorage.setItem(CHALLENGE_GAMES_KEY, "0");
      setChallengeGamesPlayed(0);
      runLeave(action);
      return;
    }
    setAdOpen(true);
  }, [vipReady, isVip, adOpen]);

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

  const clockRunning = phase === "play" && question !== null && timedId === question.id;
  const urgent = clockRunning && remainingMs <= 3000;
  const seconds = clockRunning ? Math.max(0, Math.ceil(remainingMs / 1000)) : 10;
  const barWidth = clockRunning ? (remainingMs / ROUND_MS) * 100 : phase === "play" ? 100 : 0;
  const showBoard = phase !== "play";

  return (
    <div
      className={`mx-auto flex w-full max-w-md flex-col font-sans text-zinc-950 md:max-w-4xl dark:text-zinc-50 ${
        phase === "play"
          ? "h-[100dvh] overflow-hidden p-3 md:h-auto md:min-h-screen md:overflow-visible md:p-4 md:py-10"
          : "min-h-screen p-4 md:py-10"
      }`}
    >
      <header className={`flex shrink-0 items-center justify-between gap-3 ${phase === "play" ? "mb-2" : "mb-4"}`}>
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
        >
          <span aria-hidden="true">←</span>
          {t.challengeMode.backHome}
        </Link>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span>🔥 {streak}</span>
          <span>
            {score.toLocaleString()} {t.honorCard.points}
          </span>
          <span className={urgent ? "text-red-600 dark:text-red-400" : ""}>{seconds}s</span>
        </div>
      </header>

      <div
        className={`h-1.5 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${
          phase === "play" ? "mb-2" : "mb-4"
        } ${
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
            <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">{t.challengeMode.badge}</p>
            <h1 className="mt-2 text-3xl font-black">⚡ {t.challengeMode.title}</h1>
            {status === "empty" ? (
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">還沒有可以挑戰的題目。</p>
            ) : null}
            <ul className="mt-4 flex flex-col gap-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <li>{t.challengeMode.rule1}</li>
              <li>{t.challengeMode.rule2}</li>
              <li>{t.challengeMode.rule3}</li>
            </ul>
            <button
              type="button"
              onClick={start}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-zinc-950 text-lg font-bold text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              {t.challengeMode.startBtn}
            </button>
          </div>
        </section>
      ) : null}

      {phase === "play" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <section className="flex w-full flex-col items-center">
            {status === "loading" && !question ? (
              <p className="py-16 text-center text-sm text-zinc-500">{t("drawing")}</p>
            ) : null}
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
                className={`relative mx-auto aspect-square w-[min(100%,280px,calc(100dvh-340px))] max-w-[280px] overflow-hidden rounded-2xl shadow-2xl sm:w-[min(100%,320px,calc(100dvh-340px))] sm:max-w-[320px] ${
                  urgent ? "animate-challenge-alarm ring-4 ring-red-500" : ""
                }`}
              >
                <img
                  src={publicImageUrl(question.crop_image_path)}
                  alt="這題的特寫"
                  className="absolute inset-0 h-full w-full object-cover"
                  onLoad={() => armClock(question.id)}
                  onError={() => armClock(question.id)}
                />
              </div>
            ) : null}
          </section>
          <section className="flex w-full max-w-[280px] shrink-0 flex-col gap-3 sm:max-w-[320px]">
            {status === "ready"
              ? options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onGuess(option)}
                    disabled={!clockRunning}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-left text-base font-medium disabled:opacity-60 dark:border-white/15 dark:bg-zinc-950"
                  >
                    {option.text}
                  </button>
                ))
              : null}
            {status === "error" ? (
              <button
                type="button"
                onClick={() => void retryLoad()}
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

      {phase === "play" ? null : <SiteFooter className="mt-8" />}

      <AdModal open={adOpen} onComplete={finishChallengeAd} />

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
              {shame ? (
                <ShareShameButton
                  report={{
                    mode: "challenge",
                    score,
                    cropUrl: shame.cropUrl,
                    pickedText: shame.pickedText,
                    answerText: shame.answerText,
                    taunt: shame.taunt,
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setLadderRequest((current) => current + 1)}
                className="h-12 rounded-full border border-amber-400/60 text-base font-bold text-amber-800 dark:text-amber-200"
              >
                完整天梯榜 ➔
              </button>
              <button
                type="button"
                onClick={() => leaveChallenge("restart")}
                className="h-12 rounded-full bg-zinc-950 text-base font-bold text-white dark:bg-zinc-50 dark:text-zinc-950"
              >
                再挑戰一次
              </button>
              <button
                type="button"
                onClick={() => leaveChallenge("home")}
                className="flex h-12 items-center justify-center rounded-full border border-black/10 text-base font-semibold dark:border-white/15"
              >
                回到首頁
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
