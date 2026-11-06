"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "@/components/language-provider";
import { LeaderboardModal, PlayerAvatar } from "@/components/LeaderboardModal";
import { loadLadder, type LeaderboardEntry, type LeaderboardMode } from "@/lib/leaderboard";
import { supabase } from "@/lib/supabase";

function rankTitle(rank: number, prefix: string, suffix: string) {
  const core = suffix.trim()
    ? [prefix, String(rank), suffix].filter((part) => part.trim().length > 0).join(" ")
    : `${prefix}${rank}`;
  return rank <= 3 ? `👑 ${core}` : `#${rank}`;
}

function avatarFromUser(user: User) {
  const meta = user.user_metadata ?? {};
  const url = meta.avatar_url || meta.picture || "";
  const name = String(meta.full_name || meta.name || user.email?.split("@")[0] || "玩家");
  return {
    name,
    src: typeof url === "string" && url.trim() ? url : null,
  };
}

export function HonorCard({
  refreshKey = 0,
  openRequest = 0,
  showChallengeLink = false,
  leaderboardMode = "endless",
  challengeDate,
  appearance,
}: {
  refreshKey?: number;
  openRequest?: number;
  showChallengeLink?: boolean;
  leaderboardMode?: LeaderboardMode;
  challengeDate?: string | null;
  appearance?: "lobby";
}) {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<LeaderboardEntry | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      const ladder = await loadLadder(sessionUser?.id ?? null, 50, leaderboardMode, challengeDate);
      if (!active) return;
      setUser(sessionUser);
      setEntries(ladder.entries);
      setMe(ladder.me);
      setUnavailable(ladder.unavailable);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, leaderboardMode, challengeDate]);

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  async function signIn() {
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setSigningIn(false);
  }

  const profile = user ? avatarFromUser(user) : null;

  if (appearance === "lobby") return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 text-inherit">
        <div>
          <h2 className="text-sm font-semibold">{t.honorCard.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--lobby-muted)]">
            {!ready ? t.honorCard.loading : !user ? t.honorCard.signInHint : unavailable
              ? "排行榜暫時無法讀取，請稍後再試。"
              : me ? `${rankTitle(me.rank, t.honorCard.rankPrefix, t.honorCard.rankSuffix)} · ${me.total_score.toLocaleString()} ${t.honorCard.points}`
              : t.honorCard.unranked}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ready && !user ? <button type="button" disabled={signingIn} onClick={() => void signIn()} className="min-h-11 underline underline-offset-4 disabled:opacity-60">{t("login")}</button> : null}
          <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-[var(--lobby-line)] px-4 text-sm font-semibold">{t.honorCard.leaderboardBtn}</button>
        </div>
      </section>
      <LeaderboardModal open={open} onClose={() => setOpen(false)} entries={entries} me={me} unavailable={unavailable} loggedIn={Boolean(user)} />
    </>
  );

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-game-line bg-game-panel p-4 text-foreground sm:col-span-2">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="mt-1 text-lg font-black text-foreground">{t.honorCard.title}</h2>
            {!ready ? <p className="mt-2 text-sm text-foreground">{t.honorCard.loading}</p> : null}
            {ready && !user ? (
              <p className="mt-2 text-sm leading-6 text-foreground/90">{t.honorCard.signInHint}</p>
            ) : null}
            {ready && user && unavailable ? (
              <p className="mt-2 text-sm leading-6 text-foreground/90">排行榜資料表還沒建立，打完的分數會先留在這一局。</p>
            ) : null}
            {ready && user && !unavailable && !me ? (
              <div className="mt-3 flex items-center gap-3">
                <PlayerAvatar name={profile?.name ?? "玩家"} src={profile?.src ?? null} className="h-12 w-12 text-lg" />
                <p className="text-sm leading-6 text-foreground">{t.honorCard.unranked}</p>
              </div>
            ) : null}
            {ready && me ? (
              <div className="mt-3 flex items-center gap-3">
                <PlayerAvatar
                  name={me.username}
                  src={me.avatar_url}
                  className="h-14 w-14 text-xl"
                  ring={me.rank === 1 ? "inline-flex rounded-full bg-game-accent p-[3px]" : undefined}
                />
                <div className="min-w-0">
                  <p className="text-2xl font-black text-foreground ">
                    {rankTitle(me.rank, t.honorCard.rankPrefix, t.honorCard.rankSuffix)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    ⚡ {me.total_score.toLocaleString()} {t.honorCard.points}
                  </p>
                  <p className="text-xs text-foreground">
                    🔥 {t.honorCard.maxStreak} {me.streak_count}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {ready && !user ? (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signIn()}
                className="h-10 rounded-xl bg-game-accent px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {t("login")}
              </button>
            ) : null}
            {ready && user && !unavailable && !me && showChallengeLink ? (
              <Link
                href="/challenge"
                className="inline-flex h-10 items-center rounded-xl bg-game-accent px-4 text-sm font-bold text-white"
              >
                {t.challengeMode.startBtn}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-10 rounded-xl border border-game-line px-4 text-sm font-semibold text-foreground"
            >
              {t.honorCard.leaderboardBtn}
            </button>
          </div>
        </div>
      </section>
      <LeaderboardModal
        open={open}
        onClose={() => setOpen(false)}
        entries={entries}
        me={me}
        unavailable={unavailable}
        loggedIn={Boolean(user)}
      />
    </>
  );
}
