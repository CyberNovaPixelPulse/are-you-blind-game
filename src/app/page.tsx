import type { Metadata } from "next";
import Link from "next/link";
import { AuthMenu } from "@/components/auth-menu";
import { HonorCard } from "@/components/honor-card";
import { PkEntry } from "@/components/pk-entry";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "你瞎了嗎？",
  description: "看特寫，猜這張圖是什麼",
};

const lockedModes = [
  {
    icon: "🎯",
    title: "主題專案包",
    note: "即將登場 / 垂直題庫",
  },
] as const;

export default function LobbyPage() {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md justify-end md:max-w-2xl">
        <AuthMenu />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 md:max-w-2xl">
        <header className="flex flex-col gap-3 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Guess Meme
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
            你瞎了嗎？
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            只給你一張特寫。看走眼就準備被嘲。
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="模式選擇">
          <HonorCard showChallengeLink />
          <Link
            href="/play"
            className="group flex flex-col gap-2 rounded-3xl border border-black/10 bg-white p-5 shadow-lg shadow-black/5 transition-transform active:scale-[0.99] hover:-translate-y-0.5 dark:border-white/15 dark:bg-zinc-950 dark:shadow-black/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">經典模式</h2>
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950">
                開始
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              無壓力休閒答題，答錯看迷因毒舌吐槽
            </p>
          </Link>
          <Link
            href="/challenge"
            className="group flex flex-col gap-2 rounded-3xl border border-amber-400/40 bg-amber-50 p-5 shadow-lg shadow-amber-500/10 transition-transform active:scale-[0.99] hover:-translate-y-0.5 dark:border-amber-300/30 dark:bg-amber-950/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">⚡ 挑戰模式</h2>
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950">
                10 秒
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-700 dark:text-amber-100/80">
              10秒極速累分，答錯或超時就結束
            </p>
          </Link>
          <PkEntry />

          {lockedModes.map((mode) => (
            <div
              key={mode.title}
              aria-disabled="true"
              className="flex flex-col gap-2 rounded-3xl border border-dashed border-black/15 bg-zinc-100/80 p-5 text-zinc-500 sm:col-span-2 dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-400"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">
                  {mode.icon} {mode.title}
                </h2>
                <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/15">
                  鎖定
                </span>
              </div>
              <p className="text-sm leading-6">{mode.note}</p>
            </div>
          ))}
        </section>

        <Link
          href="/create"
          className="flex h-16 items-center justify-center rounded-full bg-zinc-950 text-lg font-bold text-white shadow-lg shadow-black/20 transition-transform active:scale-[0.99] dark:bg-zinc-50 dark:text-zinc-950"
        >
          📸 我要出題
        </Link>
      </div>
      <SiteFooter className="mx-auto w-full max-w-md pt-8 md:max-w-2xl" />
    </main>
  );
}
