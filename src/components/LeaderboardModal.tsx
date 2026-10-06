"use client";

import { useEffect } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { UserAvatar } from "@/components/user-avatar";

function rankMark(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export function PlayerAvatar({
  name,
  src,
  className,
  ring,
}: {
  name: string;
  src: string | null;
  className: string;
  ring?: string;
}) {
  return <UserAvatar name={name} src={src} className={className} ring={ring} />;
}

function goldRing(size: string) {
  return `animate-ladder-gold inline-flex rounded-full bg-[linear-gradient(120deg,#f59e0b,#fff7d6,#fbbf24,#b45309,#fde68a,#f59e0b)] bg-[length:220%_220%] p-[3px] shadow-[0_0_18px_rgba(251,191,36,0.75)] ${size}`;
}

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const styles =
    entry.rank === 1
      ? {
          shell: "border-amber-300/70 bg-gradient-to-b from-amber-300/20 to-zinc-950 shadow-[0_0_28px_rgba(251,191,36,0.35)] sm:-translate-y-4",
          name: "text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]",
          ring: goldRing(""),
          label: "冠軍",
        }
      : entry.rank === 2
        ? {
            shell: "border-zinc-200/70 bg-gradient-to-b from-zinc-100/15 to-zinc-950",
            name: "text-zinc-100",
            ring: "inline-flex rounded-full bg-gradient-to-br from-white to-zinc-400 p-[3px]",
            label: "亞軍",
          }
        : {
            shell: "border-amber-700/80 bg-gradient-to-b from-amber-800/30 to-zinc-950",
            name: "text-amber-100",
            ring: "inline-flex rounded-full bg-gradient-to-br from-amber-200 to-amber-800 p-[3px]",
            label: "季軍",
          };

  return (
    <article className={`flex flex-col items-center gap-2 rounded-3xl border px-3 py-4 text-center ${styles.shell}`}>
      <p className="text-xs font-semibold tracking-[0.16em] text-zinc-400 uppercase">{styles.label}</p>
      <div className="relative">
        {entry.rank === 1 ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-xl">👑</span> : null}
        <PlayerAvatar name={entry.username} src={entry.avatar_url} className="h-16 w-16 text-xl" ring={styles.ring} />
      </div>
      <p className={`max-w-full truncate text-base font-black ${styles.name}`}>{entry.username}</p>
      <p className="text-sm font-semibold text-white">{rankMark(entry.rank)} {entry.total_score.toLocaleString("zh-TW")}</p>
      <p className="text-xs text-zinc-400">🔥 {entry.streak_count}</p>
    </article>
  );
}

function RankLine({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        mine ? "bg-amber-300/15 ring-1 ring-amber-300/60" : "bg-white/5"
      }`}
    >
      <span className="w-8 text-sm font-bold text-zinc-400">{entry.rank}</span>
      <PlayerAvatar name={entry.username} src={entry.avatar_url} className="h-9 w-9 text-sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.username}</span>
      <span className="text-xs text-amber-200">🔥 {entry.streak_count}</span>
      <span className="w-20 text-right text-sm font-semibold">{entry.total_score.toLocaleString("zh-TW")}</span>
    </li>
  );
}

export function LeaderboardModal({
  open,
  onClose,
  entries,
  me,
  unavailable,
  loggedIn,
}: {
  open: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  unavailable: boolean;
  loggedIn: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const podium = [1, 2, 3]
    .map((rank) => entries.find((entry) => entry.rank === rank))
    .filter((entry): entry is LeaderboardEntry => Boolean(entry));
  const rest = entries.filter((entry) => entry.rank > 3);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950 text-zinc-50" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ladder-title"
        className="mx-auto flex h-full w-full max-w-3xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-amber-300 uppercase">Global Ladder</p>
            <h2 id="ladder-title" className="text-2xl font-black">
              全服天梯榜
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-white/15 px-4 text-sm font-medium"
          >
            關閉
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {unavailable ? (
            <p className="rounded-2xl border border-white/10 px-4 py-8 text-center text-sm text-zinc-400">
              排行榜資料表還沒建立，分數會先留在這一局。
            </p>
          ) : entries.length === 0 ? (
            <p className="rounded-2xl border border-white/10 px-4 py-8 text-center text-sm text-zinc-400">
              還沒有成績。打完一局挑戰就會出現在這裡。
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                {podium.map((entry) => (
                  <div key={entry.user_id} className={entry.rank === 1 ? "sm:order-2" : entry.rank === 2 ? "sm:order-1" : "sm:order-3"}>
                    <PodiumCard entry={entry} />
                  </div>
                ))}
              </div>
              {rest.length > 0 ? (
                <ol className="mt-4 flex flex-col gap-2">
                  {rest.map((entry) => (
                    <RankLine key={entry.user_id} entry={entry} mine={me?.user_id === entry.user_id} />
                  ))}
                </ol>
              ) : null}
            </>
          )}
        </div>

        <footer className="border-t border-amber-300/30 bg-zinc-950/95 px-4 py-3 shadow-[0_-12px_30px_rgba(0,0,0,0.45)]">
          {unavailable ? (
            <p className="text-sm font-medium text-amber-100">我的當前名次　排行榜尚未就緒</p>
          ) : !loggedIn ? (
            <p className="text-sm font-medium text-amber-100">登入後就能在這裡看到我的當前名次。</p>
          ) : !me ? (
            <p className="text-sm font-medium text-amber-100">我的當前名次　尚未進入挑戰榜</p>
          ) : (
            <div className="flex items-center gap-3">
              <PlayerAvatar name={me.username} src={me.avatar_url} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-amber-200/80">我的當前名次</p>
                <p className="truncate text-base font-black text-amber-100">
                  {me.rank <= 3 ? `👑 第 ${me.rank} 名` : `#${me.rank}`}
                  <span className="ml-2 font-semibold">⚡ {me.total_score.toLocaleString("zh-TW")} 分</span>
                </p>
              </div>
              <p className="text-sm font-semibold text-amber-200">🔥 {me.streak_count}</p>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
