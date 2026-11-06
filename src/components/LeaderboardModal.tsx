"use client";

import { useEffect, useRef } from "react";
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
  return `inline-flex rounded-full bg-game-accent p-[3px] ${size}`;
}

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const styles = {
    shell: entry.rank === 1 ? "border-game-accent bg-game-selected" : "border-game-line bg-game-panel",
    name: "text-foreground",
    ring: entry.rank === 1 ? goldRing("") : "inline-flex rounded-full bg-zinc-200 p-[3px]",
    label: entry.rank === 1 ? "冠軍" : entry.rank === 2 ? "亞軍" : "季軍",
  };

  return (
    <article className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center ${styles.shell}`}>
      <p className="text-xs font-semibold  text-game-muted ">{styles.label}</p>
      <div className="relative">
        <PlayerAvatar name={entry.username} src={entry.avatar_url} className="h-16 w-16 text-xl" ring={styles.ring} />
      </div>
      <p className={`max-w-full truncate text-base font-black ${styles.name}`}>{entry.username}</p>
      <p className="text-sm font-semibold text-foreground">{rankMark(entry.rank)} {entry.total_score.toLocaleString("zh-TW")}</p>
      <p className="text-xs text-game-muted">🔥 {entry.streak_count}</p>
    </article>
  );
}

function RankLine({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        mine ? "bg-game-selected ring-1 ring-game-accent" : "bg-game-panel"
      }`}
    >
      <span className="w-8 text-sm font-bold text-game-muted">{entry.rank}</span>
      <PlayerAvatar name={entry.username} src={entry.avatar_url} className="h-9 w-9 text-sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.username}</span>
      <span className="text-xs text-foreground">🔥 {entry.streak_count}</span>
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  const podium = [1, 2, 3]
    .map((rank) => entries.find((entry) => entry.rank === rank))
    .filter((entry): entry is LeaderboardEntry => Boolean(entry));
  const rest = entries.filter((entry) => entry.rank > 3);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ladder-title"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-game-panel p-0 text-foreground"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-3xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <h2 id="ladder-title" className="text-2xl font-black">
              全服天梯榜
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-11 min-w-11 rounded-xl border border-game-line px-4 text-sm font-medium"
          >
            關閉
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {unavailable ? (
            <p className="rounded-2xl border border-game-line px-4 py-8 text-center text-sm text-game-muted">
              排行榜資料表還沒建立，分數會先留在這一局。
            </p>
          ) : entries.length === 0 ? (
            <p className="rounded-2xl border border-game-line px-4 py-8 text-center text-sm text-game-muted">
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

        <footer className="border-t border-game-line bg-game-panel px-4 py-3 ">
          {unavailable ? (
            <p className="text-sm font-medium text-foreground">我的當前名次　排行榜尚未就緒</p>
          ) : !loggedIn ? (
            <p className="text-sm font-medium text-foreground">登入後就能在這裡看到我的當前名次。</p>
          ) : !me ? (
            <p className="text-sm font-medium text-foreground">我的當前名次　尚未進入挑戰榜</p>
          ) : (
            <div className="flex items-center gap-3">
              <PlayerAvatar name={me.username} src={me.avatar_url} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground/80">我的當前名次</p>
                <p className="truncate text-base font-black text-foreground">
                  {me.rank <= 3 ? `👑 第 ${me.rank} 名` : `#${me.rank}`}
                  <span className="ml-2 font-semibold">⚡ {me.total_score.toLocaleString("zh-TW")} 分</span>
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground">🔥 {me.streak_count}</p>
            </div>
          )}
        </footer>
      </div>
    </dialog>
  );
}
