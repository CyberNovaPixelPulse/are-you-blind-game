"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "@/components/language-provider";
import { pkAnswerScore, pkBotDelayMs } from "@/lib/pk-bots";
import {
  addPkBot,
  loadPkIdentity,
  pickPkQuestionIds,
  pkTableMissing,
  RANDOM_MATCH_WAIT_MS,
  readPlayer,
  readRoom,
  saveMyPkScore,
  startPkRoom,
  updatePkBotScore,
  type PkPlayer,
  type PkRoom,
} from "@/lib/pk";
import { readStoredOptions, type QuizOption } from "@/lib/question-options";
import { quizImageUrl } from "@/lib/quiz-image";
import { recordQuestionView } from "@/lib/question-views";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/lib/supabase";

const ROOM_COLUMNS = "*";

type BattleQuestion = {
  id: string;
  crop_image_path: string;
  author_name: string;
  options: QuizOption[];
};

function publicImageUrl(path: string) {
  return quizImageUrl(path);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function countdownNumber(startedAt: string, now: number) {
  const left = new Date(startedAt).getTime() + 3000 - now;
  if (left <= 0) return 0;
  return Math.ceil(left / 1000);
}

function PlayerFace({ player }: { player: PkPlayer }) {
  return <UserAvatar name={player.username} src={player.avatar_url} className="h-12 w-12 text-sm" />;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function PkScoreboard({
  players,
  total,
  compact = false,
}: {
  players: PkPlayer[];
  total: number;
  compact?: boolean;
}) {
  const ranked = [...players].sort(
    (a, b) => b.total_score - a.total_score || b.current_question - a.current_question,
  );
  return (
    <ul className={compact ? "flex shrink-0 gap-1.5" : "flex flex-col gap-2"}>
      {ranked.map((player, index) => {
        const width = total > 0 ? Math.min(100, Math.round((player.current_question / total) * 100)) : 0;
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
        return (
          <li
            key={player.user_id}
            className={
              compact
                ? "min-w-0 flex-1 rounded-xl border border-black/10 px-2 py-1 dark:border-white/15"
                : "rounded-2xl border border-black/10 px-3 py-2 dark:border-white/15"
            }
          >
            <div className="flex items-center gap-2">
              <span className={`text-center font-black ${compact ? "text-xs" : "w-6 text-sm"}`}>{medal}</span>
              {compact ? (
                <UserAvatar name={player.username} src={player.avatar_url} className="h-7 w-7 text-[10px]" />
              ) : (
                <PlayerFace player={player} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{player.username}</span>
                  <span className="text-sm font-black tabular-nums">{player.total_score}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-[width] duration-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PkRoom({ roomCode }: { roomCode: string }) {
  const { language } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const router = useRouter();
  const code = roomCode.toUpperCase();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<PkRoom | null>(null);
  const [players, setPlayers] = useState<PkPlayer[]>([]);
  const [phase, setPhase] = useState<"loading" | "login" | "room" | "missing" | "blocked">("loading");
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [addingBot, setAddingBot] = useState(false);
  const [localProgress, setLocalProgress] = useState({ question: 0, score: 0 });
  const [botProgress, setBotProgress] = useState<Record<string, { question: number; score: number }>>({});
  const startLock = useRef(false);
  const viewed = useRef(new Set<string>());
  const shownAt = useRef(Date.now());
  const botRuns = useRef(new Set<string>());
  const alive = useRef(true);
  const botProgressRef = useRef(botProgress);
  botProgressRef.current = botProgress;

  async function loadRoom(currentUser: User) {
    const found = await supabase.from("pk_rooms").select(ROOM_COLUMNS).eq("room_code", code).maybeSingle();
    if (found.error) {
      setNotice(pkTableMissing(found.error) ? "PK 資料表還沒建立，請先執行對戰 SQL。" : "房間讀取失敗");
      setPhase("missing");
      return;
    }
    const nextRoom = readRoom(found.data);
    if (!nextRoom) {
      setPhase("missing");
      return;
    }
    const seated = await supabase.from("pk_participants").select("*").eq("room_id", nextRoom.id);
    if (seated.error) {
      setRoom(nextRoom);
      setNotice(pkTableMissing(seated.error) ? "PK 資料表還沒建立，請先執行對戰 SQL。" : "玩家名單讀取失敗");
      setPhase(pkTableMissing(seated.error) ? "missing" : "room");
      return;
    }
    const nextPlayers = (seated.data ?? [])
      .map(readPlayer)
      .filter((player): player is PkPlayer => Boolean(player))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const alreadyIn = nextPlayers.some((player) => player.user_id === currentUser.id);
    if (!alreadyIn) {
      if (nextRoom.status !== "waiting") {
        setNotice("這局對戰已經開始");
        setRoom(nextRoom);
        setPlayers(nextPlayers);
        setPhase("blocked");
        return;
      }
      if (nextPlayers.length >= nextRoom.max_players) {
        setNotice("房間已滿");
        setRoom(nextRoom);
        setPlayers(nextPlayers);
        setPhase("blocked");
        return;
      }
      const identity = await loadPkIdentity(currentUser);
      const joined = await supabase.from("pk_participants").insert({
        room_id: nextRoom.id,
        user_id: currentUser.id,
        username: identity.username,
        avatar_url: identity.avatarUrl,
      });
      if (joined.error && joined.error.code !== "23505") {
        setNotice(joined.error.message.includes("已滿") ? "房間已滿" : "加入房間失敗");
        setPhase("blocked");
        return;
      }
      const again = await supabase.from("pk_participants").select("*").eq("room_id", nextRoom.id);
      const refreshed = (again.data ?? [])
        .map(readPlayer)
        .filter((player): player is PkPlayer => Boolean(player))
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
      setPlayers(refreshed);
    } else {
      setPlayers(nextPlayers);
    }
    setRoom(nextRoom);
    setPhase("room");
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      setReady(true);
      if (!sessionUser) {
        setPhase("login");
        return;
      }
      void loadRoom(sessionUser);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      setReady(true);
      if (!sessionUser) setPhase("login");
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [code]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`pk-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pk_participants", filter: `room_id=eq.${room.id}` },
        () => {
          if (user) void loadRoom(user);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pk_rooms", filter: `id=eq.${room.id}` },
        () => {
          if (user) void loadRoom(user);
        },
      )
      .subscribe();
    const poll = window.setInterval(() => {
      if (!user) return;
      if (room.status === "waiting" || room.status === "playing") void loadRoom(user);
    }, room.status === "playing" ? 1200 : 3000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [room?.id, room?.status, user?.id]);

  useEffect(() => {
    if (!room || room.status !== "playing" || !room.started_at) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [room?.status, room?.started_at]);

  useEffect(() => {
    if (!user || !room || room.mode !== "random" || room.status !== "waiting" || players.length < 2) return;
    if (!players.some((player) => player.user_id === user.id) || startLock.current) return;
    startLock.current = true;
    void beginBattle().finally(() => {
      startLock.current = false;
    });
  }, [room?.id, room?.status, room?.mode, players.length, user?.id]);

  useEffect(() => {
    if (!room || room.status !== "playing" || room.question_ids.length === 0) return;
    let active = true;
    void supabase
      .from("questions")
      .select("id, crop_image_path, author_name, options")
      .in("id", room.question_ids)
      .then(({ data, error }) => {
        if (!active || error) return;
        const byId = new Map((data ?? []).map((row) => [row.id, row]));
        const ordered = room.question_ids.flatMap((id) => {
          const row = byId.get(id);
          if (!row || typeof row.crop_image_path !== "string") return [];
          const options = shuffle(readStoredOptions(row.options));
          if (options.length === 0) return [];
          return [
            {
              id,
              crop_image_path: row.crop_image_path,
              author_name: typeof row.author_name === "string" ? row.author_name : "",
              options,
            },
          ];
        });
        setQuestions(ordered);
      });
    return () => {
      active = false;
    };
  }, [room?.id, room?.status, room?.question_ids.join("|")]);

  const current = questions[questionIndex] ?? null;
  useEffect(() => {
    if (!current || viewed.current.has(current.id)) return;
    viewed.current.add(current.id);
    recordQuestionView(current.id);
  }, [current?.id]);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.id]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setLocalProgress({ question: 0, score: 0 });
    setBotProgress({});
    botRuns.current = new Set();
  }, [room?.id]);

  async function beginBattle() {
    if (!room) return;
    setStarting(true);
    setNotice("");
    try {
      const ids = await pickPkQuestionIds(5, languageRef.current);
      if (ids.length === 0) {
        setNotice("題庫還沒有可以對戰的題目");
        return;
      }
      await startPkRoom(room.id, ids);
      if (user) await loadRoom(user);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "開賽失敗";
      setNotice(message);
    } finally {
      setStarting(false);
    }
  }

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  }

  async function leaveRoom() {
    if (user && room && room.status === "waiting") {
      await supabase.from("pk_participants").delete().eq("room_id", room.id).eq("user_id", user.id);
    }
    router.push("/pk");
  }

  const countLeft = room?.started_at ? countdownNumber(room.started_at, now) : null;
  const inBattle = room?.status === "playing" && countLeft === 0;
  const host = Boolean(user && room && room.host_id === user.id);
  const canStart = Boolean(room && room.mode === "private" && host && room.status === "waiting" && players.length >= 2);
  const rosterKey = players.map((player) => `${player.user_id}:${player.is_bot ? 1 : 0}`).join("|");
  const questionTotal = questions.length || room?.question_ids.length || 5;
  const boardPlayers = players.map((player) => {
    if (user && player.user_id === user.id && localProgress.question >= player.current_question) {
      return { ...player, current_question: localProgress.question, total_score: localProgress.score };
    }
    const simulated = botProgress[player.user_id];
    if (player.is_bot && simulated) {
      return {
        ...player,
        current_question: Math.max(player.current_question, simulated.question),
        total_score: Math.max(player.total_score, simulated.score),
      };
    }
    return player;
  });
  const botsStillPlaying = boardPlayers.some((player) => player.is_bot && player.current_question < questionTotal);

  useEffect(() => {
    if (!host || !user || !room || room.mode !== "random" || room.status !== "waiting") return;
    const humans = players.filter((player) => !player.is_bot);
    if (humans.length !== 1 || humans[0]?.user_id !== user.id || players.some((player) => player.is_bot)) return;
    const roomId = room.id;
    const names = players.map((player) => player.username);
    const timer = window.setTimeout(() => {
      void addPkBot(roomId, names)
        .then(() => loadRoom(user))
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : "";
          setNotice(
            pkTableMissing(caught as { code?: string }) || message.toLowerCase().includes("add_pk_bot")
              ? "對戰資料還沒準備好，請先執行最新的對戰 SQL。"
              : "這位對手暫時進不來，請再試一次",
          );
        });
    }, RANDOM_MATCH_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [host, user?.id, room?.id, room?.mode, room?.status, rosterKey]);

  useEffect(() => {
    if (!inBattle || !host || !room) return;
    const total = room.question_ids.length;
    if (total < 1) return;
    const roomId = room.id;
    let cancelled = false;
    const started: string[] = [];
    for (const bot of players) {
      const runKey = `${roomId}:${bot.user_id}`;
      if (!bot.is_bot || botRuns.current.has(runKey)) continue;
      const botId = bot.user_id;
      const saved = botProgressRef.current[botId];
      let question = Math.max(bot.current_question, saved?.question ?? 0);
      let score = Math.max(bot.total_score, saved?.score ?? 0);
      if (question >= total) continue;
      botRuns.current.add(runKey);
      started.push(runKey);
      void (async () => {
        while (question < total && !cancelled) {
          const delay = pkBotDelayMs();
          await sleep(delay);
          if (cancelled || !alive.current) return;
          score += pkAnswerScore(delay, Math.random() < 0.7);
          question += 1;
          const nextQuestion = question;
          const nextScore = score;
          setBotProgress((current) => {
            const previous = current[botId];
            if (previous && previous.question >= nextQuestion && previous.score >= nextScore) return current;
            return { ...current, [botId]: { question: nextQuestion, score: nextScore } };
          });
          try {
            await updatePkBotScore(roomId, botId, nextQuestion, nextScore);
          } catch {
            // 伺服器暫時沒寫上時，畫面上的進度仍保留，下一題會再試。
          }
        }
      })();
    }
    return () => {
      cancelled = true;
      for (const key of started) botRuns.current.delete(key);
    };
  }, [inBattle, host, room?.id, room?.question_ids.length, rosterKey]);

  function answer(option: QuizOption) {
    if (!current || pickedId || !user || !room) return;
    const gained = pkAnswerScore(Date.now() - shownAt.current, option.isCorrect);
    const nextQuestion = questionIndex + 1;
    const nextScore = localProgress.score + gained;
    setLocalProgress({ question: nextQuestion, score: nextScore });
    setPickedId(option.id);
    void saveMyPkScore(room.id, user.id, nextQuestion, nextScore);
  }

  useEffect(() => {
    if (!pickedId) return;
    const timer = window.setTimeout(() => {
      setPickedId(null);
      setQuestionIndex((index) => index + 1);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [pickedId]);

  async function addVirtualPlayer() {
    if (!room || !user || addingBot) return;
    setAddingBot(true);
    setNotice("");
    try {
      await addPkBot(room.id, players.map((player) => player.username));
      await loadRoom(user);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setNotice(
        message.includes("已滿")
          ? "房間已滿"
          : pkTableMissing(caught as { code?: string }) || message.toLowerCase().includes("add_pk_bot")
            ? "對戰資料還沒準備好，請先執行最新的對戰 SQL。"
            : "這位對手暫時進不來，請再試一次",
      );
    } finally {
      setAddingBot(false);
    }
  }

  return (
    <main
      className={
        inBattle && current
          ? "mx-auto flex h-[100dvh] w-full max-w-md flex-col justify-between overflow-hidden p-3"
          : "mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void leaveRoom()}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
        >
          <span aria-hidden="true">←</span>
          回到大廳
        </button>
        {room?.mode === "private" ? (
          <p className="text-sm font-black tracking-[0.35em]">{room.room_code}</p>
        ) : (
          <span className="text-sm font-semibold text-rose-500">{room?.mode === "random" ? "隨機匹配" : ""}</span>
        )}
      </div>

      {!ready || phase === "loading" ? <p className="text-sm text-zinc-500">正在進入房間…</p> : null}

      {phase === "login" ? (
        <section className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
          <p className="font-medium">登入 Google 之後才能加入這間 PK 房。</p>
          <button
            type="button"
            onClick={() => void signIn()}
            className="mt-4 h-12 w-full rounded-full bg-zinc-950 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            使用 Google 登入
          </button>
        </section>
      ) : null}

      {phase === "missing" ? (
        <section className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
          <h1 className="text-xl font-bold">找不到這個房間</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{notice || "房號可能打錯了。"}</p>
          <Link href="/pk" className="mt-4 inline-flex h-11 items-center text-sm font-semibold">
            回 PK 大廳
          </Link>
        </section>
      ) : null}

      {phase === "blocked" ? (
        <section className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
          <h1 className="text-xl font-bold">{notice || "現在進不去"}</h1>
          <Link href="/pk" className="mt-4 inline-flex h-11 items-center text-sm font-semibold">
            回 PK 大廳
          </Link>
        </section>
      ) : null}

      {phase === "room" && room && countLeft !== null && countLeft > 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-rose-500 uppercase">Ready</p>
          <p className="text-8xl font-black tabular-nums">{countLeft}</p>
          <p className="text-sm text-zinc-500">全員同步倒數，結束後進入猜題</p>
        </section>
      ) : null}

      {phase === "room" && room && room.status === "waiting" ? (
        <section className="flex flex-col gap-4">
          <header>
            <p className="text-sm font-semibold text-rose-500">
              {room.mode === "random" ? "隨機匹配" : "好友房"}
            </p>
            {room.mode === "random" ? (
              <h1 className="mt-1 text-3xl font-black">正在開賽</h1>
            ) : (
              <h1 className="mt-1 text-3xl font-black tracking-[0.28em]">{room.room_code}</h1>
            )}
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {room.mode === "random"
                ? "正在尋找實力相當的對手..."
                : `已加入 ${players.length} / ${room.max_players} 人。滿 2 人後由房長開賽。`}
            </p>
          </header>
          <ul className="flex flex-col gap-2">
            {players.map((player) => (
              <li
                key={player.user_id}
                className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-950"
              >
                <PlayerFace player={player} />
                <span className="min-w-0 flex-1 truncate font-semibold">{player.username}</span>
                {player.user_id === room.host_id ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
                    房長
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {host && room.mode === "private" && players.length < room.max_players ? (
            <button
              type="button"
              disabled={addingBot}
              onClick={() => void addVirtualPlayer()}
              className="h-11 rounded-full border border-black/10 text-sm font-semibold disabled:opacity-60 dark:border-white/15"
            >
              {addingBot ? "正在加入…" : "補一位對手"}
            </button>
          ) : null}
          {canStart ? (
            <button
              type="button"
              disabled={starting}
              onClick={() => void beginBattle()}
              className="h-14 rounded-full bg-rose-500 text-base font-bold text-white disabled:opacity-60"
            >
              {starting ? "正在抽題…" : "開始對戰"}
            </button>
          ) : null}
          {room.mode === "private" && host && players.length < 2 ? (
            <p className="text-sm text-zinc-500">還要再等一位玩家。補上一位對手後就能開始對戰。</p>
          ) : null}
          {notice ? <p className="text-sm text-amber-700 dark:text-amber-300">{notice}</p> : null}
        </section>
      ) : null}

      {phase === "room" && inBattle ? (
        <section className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <h1 className="text-base font-black">PK 猜題</h1>
            <p className="text-sm font-semibold text-zinc-500">
              {questions.length === 0 ? "載入題目" : `${Math.min(questionIndex + 1, questions.length)} / ${questions.length}`}
            </p>
          </header>
          {current ? (
            <>
              <PkScoreboard players={boardPlayers} total={questionTotal} compact />
              <p className="truncate text-xs text-zinc-500">{current.author_name}</p>
              <div className="relative h-[min(30vh,220px)] shrink-0 overflow-hidden rounded-3xl bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicImageUrl(current.crop_image_path)} alt="這題的特寫" className="h-full w-full object-cover" />
              </div>
              <div className="grid shrink-0 grid-cols-1 gap-2">
                {current.options.map((option) => {
                  const selected = pickedId === option.id;
                  const revealed = pickedId !== null;
                  const tone = revealed && option.isCorrect
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : revealed && selected
                      ? "animate-quiz-shake border-red-500 bg-red-500 text-white"
                      : "border-black/10 bg-white dark:border-white/15 dark:bg-zinc-950";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={revealed}
                      onClick={() => answer(option)}
                      className={`rounded-2xl border px-4 py-3 text-left text-base font-medium ${tone}`}
                    >
                      {option.text}
                    </button>
                  );
                })}
              </div>
            </>
          ) : questionIndex >= questions.length && questions.length > 0 ? (
            <div className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
              <h2 className="text-2xl font-black">{botsStillPlaying ? "結算中" : "最終排名"}</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {botsStillPlaying ? "對手正在全力衝刺作答中..." : "5 題都猜完了，名次依得分排列。"}
              </p>
              <div className="mt-4">
                <PkScoreboard players={boardPlayers} total={questionTotal} />
              </div>
              <Link
                href="/pk"
                className="mt-4 flex h-12 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white"
              >
                回 PK 大廳
              </Link>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">正在把對戰題目送進畫面…</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
