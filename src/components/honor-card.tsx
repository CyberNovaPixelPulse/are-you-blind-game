"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "@/components/language-provider";
import { LeaderboardModal, PlayerAvatar } from "@/components/LeaderboardModal";
import { loadLadder, type LeaderboardEntry } from "@/lib/leaderboard";
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
}: {
  refreshKey?: number;
  openRequest?: number;
  showChallengeLink?: boolean;
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
      const ladder = await loadLadder(sessionUser?.id ?? null, 50);
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
  }, [refreshKey]);

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

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/40 bg-zinc-950 p-4 text-amber-50 shadow-[0_0_28px_rgba(251,191,36,0.28)] sm:col-span-2">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.35),transparent_52%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-300/90 uppercase">Honor</p>
            <h2 className="mt-1 text-lg font-black text-amber-100">🏆 {t.honorCard.title}</h2>
            {!ready ? <p className="mt-2 text-sm text-amber-100/70">{t.honorCard.loading}</p> : null}
            {ready && !user ? (
              <p className="mt-2 text-sm leading-6 text-amber-50/90">{t.honorCard.signInHint}</p>
            ) : null}
            {ready && user && unavailable ? (
              <p className="mt-2 text-sm leading-6 text-amber-50/90">排行榜資料表還沒建立，打完的分數會先留在這一局。</p>
            ) : null}
            {ready && user && !unavailable && !me ? (
              <div className="mt-3 flex items-center gap-3">
                <PlayerAvatar name={profile?.name ?? "玩家"} src={profile?.src ?? null} className="h-12 w-12 text-lg" />
                <p className="text-sm leading-6 text-amber-50">{t.honorCard.unranked}</p>
              </div>
            ) : null}
            {ready && me ? (
              <div className="mt-3 flex items-center gap-3">
                <PlayerAvatar
                  name={me.username}
                  src={me.avatar_url}
                  className="h-14 w-14 text-xl"
                  ring={me.rank === 1 ? "animate-ladder-gold inline-flex rounded-full bg-[linear-gradient(120deg,#f59e0b,#fff7d6,#fbbf24,#b45309,#fde68a)] bg-[length:220%_220%] p-[3px]" : undefined}
                />
                <div className="min-w-0">
                  <p className="text-2xl font-black text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]">
                    {rankTitle(me.rank, t.honorCard.rankPrefix, t.honorCard.rankSuffix)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    ⚡ {me.total_score.toLocaleString()} {t.honorCard.points}
                  </p>
                  <p className="text-xs text-amber-100/80">
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
                className="h-10 rounded-full bg-amber-300 px-4 text-sm font-bold text-zinc-950 disabled:opacity-60"
              >
                {t("login")}
              </button>
            ) : null}
            {ready && user && !unavailable && !me && showChallengeLink ? (
              <Link
                href="/challenge"
                className="inline-flex h-10 items-center rounded-full bg-amber-300 px-4 text-sm font-bold text-zinc-950"
              >
                {t.challengeMode.startBtn}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-10 rounded-full border border-amber-200/50 px-4 text-sm font-semibold text-amber-100"
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
