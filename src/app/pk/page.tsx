"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "@/components/language-provider";
import { VipPurchaseModal } from "@/components/vip-purchase-modal";
import { fillTemplate } from "@/lib/ui-sections";
import {
  addPkBot,
  loadPkIdentity,
  makeRoomCode,
  normalizeRoomCode,
  pickPkQuestionIds,
  RANDOM_MATCH_WAIT_MS,
  pkTableMissing,
  readRoom,
  startPkRoom,
} from "@/lib/pk";
import { supabase } from "@/lib/supabase";

const ROOM_COLUMNS = "*";
const MISSING_TABLE = "PK 資料表還沒建立，請先執行對戰 SQL。";

function fail(error: { code?: string; message: string }): never {
  throw Object.assign(new Error(error.message), { code: error.code });
}

function pkAlert(caught: unknown, fallback: string) {
  const code =
    caught && typeof caught === "object" && "code" in caught
      ? (caught as { code?: string | null }).code
      : undefined;
  if (pkTableMissing({ code })) return MISSING_TABLE;
  return fallback;
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function PkLobbyPage() {
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"random" | "create" | "join" | "login" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [matching, setMatching] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isVip, setIsVip] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [vipPrompt, setVipPrompt] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);
  const [vipNote, setVipNote] = useState("");
  const matchGeneration = useRef(0);
  const searchRoomId = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      matchGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!matching) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 250);
    return () => window.clearInterval(timer);
  }, [matching]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setIsVip(false);
      setProfileReady(true);
      return;
    }
    let active = true;
    setProfileReady(false);
    void supabase
      .from("profiles")
      .select("is_vip")
      .eq("id", userId)
      .maybeSingle()
      .then(
        ({ data, error: profileError }) => {
          if (!active) return;
          setIsVip(!profileError && data?.is_vip === true);
          setProfileReady(true);
        },
        () => {
          if (!active) return;
          setIsVip(false);
          setProfileReady(true);
        },
      );
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function signIn() {
    setBusy("login");
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/pk` },
    });
    if (signInError) {
      setError("Google 登入失敗，請再試一次");
      setBusy(null);
    }
  }

  async function createRoom(mode: "random" | "private") {
    if (!user) return null;
    const identity = await loadPkIdentity(user);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomCode = makeRoomCode();
      const inserted = await supabase
        .from("pk_rooms")
        .insert({
          room_code: roomCode,
          host_id: user.id,
          mode,
          status: "waiting",
          max_players: mode === "random" ? 2 : 4,
        })
        .select(ROOM_COLUMNS)
        .single();
      if (inserted.error) {
        if (inserted.error.code === "23505") continue;
        fail(inserted.error);
      }
      const room = readRoom(inserted.data);
      if (!room) throw new Error("房間建立失敗");
      const joined = await supabase.from("pk_participants").insert({
        room_id: room.id,
        user_id: user.id,
        username: identity.username,
        avatar_url: identity.avatarUrl,
      });
      if (joined.error && joined.error.code !== "23505") fail(joined.error);
      return room;
    }
    throw new Error("房號暫時搶不到，請再試一次");
  }

  async function countHumans(roomId: string) {
    const seated = await supabase.from("pk_participants").select("user_id, is_bot").eq("room_id", roomId);
    if (seated.error) throw Object.assign(new Error(seated.error.message), { code: seated.error.code });
    return (seated.data ?? []).filter((row) => row.is_bot !== true).length;
  }

  function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function stillSearching(generation: number) {
    return matchGeneration.current === generation;
  }

  function cancelMatch() {
    matchGeneration.current += 1;
    const roomId = searchRoomId.current;
    searchRoomId.current = null;
    setMatching(false);
    setSummoning(false);
    setElapsedMs(0);
    setBusy(null);
    if (user && roomId) {
      void supabase.from("pk_participants").delete().eq("room_id", roomId).eq("user_id", user.id);
    }
  }

  async function matchRandom() {
    if (!user) {
      void signIn();
      return;
    }
    const generation = matchGeneration.current + 1;
    matchGeneration.current = generation;
    searchRoomId.current = null;
    setBusy("random");
    setError("");
    setSummoning(false);
    setElapsedMs(0);
    setMatching(true);
    let entered = false;
    try {
      const waiting = await supabase
        .from("pk_rooms")
        .select(ROOM_COLUMNS)
        .eq("status", "waiting")
        .eq("mode", "random")
        .order("created_at", { ascending: true })
        .limit(8);
      if (waiting.error) fail(waiting.error);
      if (!stillSearching(generation)) return;
      const identity = await loadPkIdentity(user);
      for (const row of waiting.data ?? []) {
        if (!stillSearching(generation)) return;
        const room = readRoom(row);
        if (!room || room.host_id === user.id) continue;
        const seated = await supabase.from("pk_participants").select("user_id").eq("room_id", room.id);
        if (seated.error) fail(seated.error);
        const ids = (seated.data ?? []).map((player) => player.user_id);
        if (!ids.includes(room.host_id) || ids.length >= room.max_players) continue;
        const joined = await supabase.from("pk_participants").insert({
          room_id: room.id,
          user_id: user.id,
          username: identity.username,
          avatar_url: identity.avatarUrl,
        });
        if (!stillSearching(generation)) {
          if (!joined.error || joined.error.code === "23505") {
            await supabase.from("pk_participants").delete().eq("room_id", room.id).eq("user_id", user.id);
          }
          return;
        }
        if (!joined.error || joined.error.code === "23505") {
          entered = true;
          router.push(`/pk/${room.room_code}`);
          return;
        }
      }
      const room = await createRoom("random");
      if (!room || !stillSearching(generation)) {
        if (room && user) {
          await supabase.from("pk_participants").delete().eq("room_id", room.id).eq("user_id", user.id);
        }
        return;
      }
      searchRoomId.current = room.id;
      try {
        await countHumans(room.id);
      } catch (caught) {
        if (pkTableMissing(caught as { code?: string })) throw caught;
        if (!stillSearching(generation)) return;
        searchRoomId.current = null;
        entered = true;
        router.push(`/pk/${room.room_code}`);
        return;
      }
      const deadline = Date.now() + RANDOM_MATCH_WAIT_MS;
      while (Date.now() < deadline) {
        if (!stillSearching(generation)) return;
        await sleep(400);
        if (!stillSearching(generation)) return;
        const humans = await countHumans(room.id);
        if (humans >= 2) {
          searchRoomId.current = null;
          entered = true;
          router.push(`/pk/${room.room_code}`);
          return;
        }
      }
      if (!stillSearching(generation)) return;
      setSummoning(true);
      try {
        const bot = await addPkBot(room.id, [identity.username]);
        if (bot && stillSearching(generation)) {
          const ids = await pickPkQuestionIds(5, languageRef.current);
          if (ids.length > 0 && stillSearching(generation)) await startPkRoom(room.id, ids);
        }
      } catch (caught) {
        if (pkTableMissing(caught as { code?: string })) throw caught;
      }
      if (!stillSearching(generation)) return;
      searchRoomId.current = null;
      entered = true;
      router.push(`/pk/${room.room_code}`);
    } catch (caught) {
      const roomId = searchRoomId.current;
      searchRoomId.current = null;
      if (user && roomId) {
        await supabase.from("pk_participants").delete().eq("room_id", roomId).eq("user_id", user.id);
      }
      setError(pkAlert(caught, "配對失敗，請再試一次"));
    } finally {
      if (stillSearching(generation) && !entered) {
        setBusy(null);
        setMatching(false);
        setSummoning(false);
      }
    }
  }

  async function createPrivate() {
    if (!user || !isVip) {
      setVipNote("");
      setVipPrompt(true);
      return;
    }
    setBusy("create");
    setError("");
    try {
      const room = await createRoom("private");
      if (room) router.push(`/pk/${room.room_code}`);
    } catch (caught) {
      setError(pkAlert(caught, "開房失敗，請再試一次"));
    } finally {
      setBusy(null);
    }
  }

  async function writeVip(mode: "toggle" | "enable") {
    if (!user) {
      void signIn();
      return;
    }
    setVipBusy(true);
    setVipNote("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setVipNote("請先登入再切換測試 VIP。");
      setVipBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/dev/toggle-vip", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(mode === "enable" ? { "Content-Type": "application/json" } : {}),
        },
        body: mode === "enable" ? JSON.stringify({ enable: true }) : undefined,
      });
      const body = (await response.json().catch(() => null)) as { is_vip?: boolean; error?: string } | null;
      if (!response.ok || typeof body?.is_vip !== "boolean") {
        setVipNote(body?.error || "切換失敗。請到 Supabase 的 profiles 把 is_vip 設成 true。");
        setVipBusy(false);
        return;
      }
      setIsVip(body.is_vip);
      setVipPrompt(false);
    } catch {
      setVipNote("切換失敗。請到 Supabase 的 profiles 把 is_vip 設成 true。");
    } finally {
      setVipBusy(false);
    }
  }

  function toggleVipPreview() {
    void writeVip("toggle");
  }

  async function joinByCode() {
    const roomCode = normalizeRoomCode(code);
    if (roomCode.length !== 4) {
      setError("請輸入 4 碼房號");
      return;
    }
    setBusy("join");
    setError("");
    if (!user) {
      setBusy(null);
      router.push(`/pk/${roomCode}`);
      return;
    }
    const found = await supabase.from("pk_rooms").select("room_code").eq("room_code", roomCode).maybeSingle();
    if (found.error) {
      setError(pkTableMissing(found.error) ? MISSING_TABLE : "房間讀取失敗");
      setBusy(null);
      return;
    }
    if (!found.data) {
      setError("找不到這個房號");
      setBusy(null);
      return;
    }
    setBusy(null);
    router.push(`/pk/${roomCode}`);
  }

  const showVipLock = !user || (profileReady && !isVip);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8">
      <Link
        href="/"
        className="inline-flex h-9 w-fit items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
      >
        <span aria-hidden="true">←</span>
        {t.pkLobby.backHome}
      </Link>
      <header>
        <p className="text-sm font-semibold tracking-[0.18em] text-rose-500 uppercase">PK</p>
        <h1 className="mt-1 text-3xl font-black">⚔️ {t.pkLobby.title}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t.pkLobby.subtitle}</p>
      </header>

      {!ready ? <p className="text-sm text-zinc-500">{t.pkLobby.checkingLogin}</p> : null}

      {ready && !user ? (
        <section className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
          <p className="text-base font-medium">{t.pkLobby.loginHint}</p>
          <button
            type="button"
            disabled={busy === "login"}
            onClick={() => void signIn()}
            className="mt-4 h-12 w-full rounded-full bg-zinc-950 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950"
          >
            {t("login")}
          </button>
        </section>
      ) : null}

      {ready ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void matchRandom()}
            className="rounded-3xl border border-amber-400/40 bg-amber-50 p-5 text-left disabled:opacity-60 dark:border-amber-300/30 dark:bg-amber-950/40"
          >
            <h2 className="text-xl font-bold">⚡ {t.pkLobby.randomMatchTitle}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-amber-100/80">{t.pkLobby.randomMatchDesc}</p>
          </button>
          <button
            type="button"
            disabled={busy !== null || (Boolean(user) && !profileReady)}
            onClick={() => void createPrivate()}
            className={`relative rounded-3xl border p-5 text-left disabled:opacity-60 ${
              showVipLock
                ? "border-amber-300/50 bg-zinc-100 text-zinc-500 dark:border-amber-200/20 dark:bg-zinc-900 dark:text-zinc-400"
                : "border-black/10 bg-white dark:border-white/15 dark:bg-zinc-950"
            }`}
          >
            {showVipLock ? (
              <span className="mb-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
                👑 {t.pkLobby.vipPrivilege}
              </span>
            ) : null}
            <h2 className="text-xl font-bold">🏠 {t.pkLobby.createRoomTitle}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {user && !profileReady
                ? t.pkLobby.checkingHost
                : busy === "create"
                  ? t.pkLobby.creatingCode
                  : showVipLock
                    ? t.pkLobby.createRoomDesc
                    : t.pkLobby.createRoomReady}
            </p>
          </button>
          {user && profileReady && isVip ? (
            <button
              type="button"
              onClick={() => {
                setVipNote("");
                setVipPrompt(true);
              }}
              className="self-start px-1 text-xs font-semibold text-zinc-500 underline decoration-zinc-400 underline-offset-4"
            >
              本機測試：調整 VIP
            </button>
          ) : null}
          <form
            className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950"
            onSubmit={(event) => {
              event.preventDefault();
              void joinByCode();
            }}
          >
            <h2 className="text-xl font-bold">🔑 {t.pkLobby.joinRoomTitle}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.pkLobby.joinRoomDesc}</p>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
                maxLength={4}
                autoCapitalize="characters"
                placeholder={t.pkLobby.roomCodePlaceholder}
                aria-label={t.pkLobby.roomCodePlaceholder}
                className="h-12 min-w-0 flex-1 rounded-2xl border border-black/10 bg-transparent px-3 text-center text-lg font-black tracking-[0.4em] uppercase outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
              />
              <button
                type="submit"
                disabled={busy === "join" || busy === "create" || matching}
                className="h-12 shrink-0 rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950"
              >
                {t.pkLobby.enterRoomBtn}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {matching ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 px-6 text-white">
          <div className="flex w-full max-w-sm flex-col items-center text-center">
            <div className="relative grid h-56 w-56 place-items-center" aria-hidden="true">
              <div className="absolute inset-0 rounded-full border border-rose-400/30" />
              <div className="absolute inset-8 rounded-full border border-rose-400/25" />
              <div className="absolute inset-16 rounded-full border border-rose-300/20" />
              <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0_68%,rgba(251,113,133,0.18)_86%,rgba(244,63,94,0.95)_100%)] motion-reduce:animate-none" />
              <div className="absolute inset-[22%] rounded-full bg-zinc-950" />
              <div className="relative h-4 w-4 rounded-full bg-rose-400 shadow-[0_0_24px_rgba(251,113,133,0.9)]" />
            </div>
            <p className="mt-8 text-sm font-semibold tracking-[0.22em] text-rose-300 uppercase">{t.pkLobby.matching}</p>
            <p aria-live="polite" className="mt-3 text-4xl font-black tabular-nums">
              {fillTemplate(t.pkLobby.searched, { time: formatElapsed(elapsedMs) })}
            </p>
            <p className="mt-3 text-sm text-zinc-300">{t.pkLobby.finding}</p>
            <p className="mt-1 text-sm text-zinc-400">{t.pkLobby.waitHint}</p>
            <button
              type="button"
              disabled={summoning}
              onClick={cancelMatch}
              className="mt-8 h-12 rounded-full border border-white/20 px-6 text-sm font-semibold disabled:opacity-50"
            >
              {summoning ? t.pkLobby.startingSoon : t.pkLobby.cancelMatch}
            </button>
          </div>
        </div>
      ) : null}

      {vipPrompt ? (
        <VipPurchaseModal
          onClose={() => setVipPrompt(false)}
          onCheckout={() => {
            void writeVip("enable");
          }}
          onTestToggle={() => void toggleVipPreview()}
          testBusy={vipBusy}
          testNote={vipNote}
        />
      ) : null}
    </main>
  );
}
