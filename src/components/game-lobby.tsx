"use client";

import Link from "next/link";
import { AuthMenu } from "@/components/auth-menu";
import { HonorCard } from "@/components/honor-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/components/language-provider";
import { PkEntry } from "@/components/pk-entry";
import { SiteFooter } from "@/components/site-footer";

export function GameLobby() {
  const { t } = useLanguage();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md items-start justify-between gap-3 md:max-w-2xl" dir="ltr">
        <LanguageSwitcher />
        <AuthMenu />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 md:max-w-2xl">
        <header className="flex flex-col gap-3 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">Guess Meme</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">{t("title")}</h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2" aria-label={t("casual")}>
          <HonorCard showChallengeLink />
          <Link
            href="/play"
            className="group flex flex-col gap-2 rounded-3xl border border-black/10 bg-white p-5 shadow-lg shadow-black/5 transition-transform hover:-translate-y-0.5 active:scale-[0.99] dark:border-white/15 dark:bg-zinc-950 dark:shadow-black/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t("casual")}</h2>
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950">
                →
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("casualHint")}</p>
          </Link>
          <Link
            href="/challenge"
            className="group flex flex-col gap-2 rounded-3xl border border-amber-400/40 bg-amber-50 p-5 shadow-lg shadow-amber-500/10 transition-transform hover:-translate-y-0.5 active:scale-[0.99] dark:border-amber-300/30 dark:bg-amber-950/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">⚡ {t("challenge")}</h2>
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950">10s</span>
            </div>
            <p className="text-sm leading-6 text-zinc-700 dark:text-amber-100/80">{t("challengeHint")}</p>
          </Link>
          <PkEntry />

          <div
            aria-disabled="true"
            className="flex flex-col gap-2 rounded-3xl border border-dashed border-black/15 bg-zinc-100/80 p-5 text-zinc-500 sm:col-span-2 dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-400"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">🎯 {t.themeCard.title}</h2>
              <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/15">
                🔒
              </span>
            </div>
            <p className="text-sm leading-6">{t.themeCard.subtitle}</p>
          </div>
        </section>

        <Link
          href="/create"
          className="flex h-16 items-center justify-center rounded-full bg-zinc-950 text-lg font-bold text-white shadow-lg shadow-black/20 transition-transform active:scale-[0.99] dark:bg-zinc-50 dark:text-zinc-950"
        >
          📸 {t("create")}
        </Link>
      </div>
      <SiteFooter className="mx-auto w-full max-w-md pt-8 md:max-w-2xl" />
    </main>
  );
}
