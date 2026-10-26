"use client";

import Link from "next/link";
import { AuthMenu } from "@/components/auth-menu";
import { HonorCard } from "@/components/honor-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/components/language-provider";
import { PkEntry } from "@/components/pk-entry";
import { uxCopyFor } from "@/lib/ux-copy";
import { SiteFooter } from "@/components/site-footer";

export function GameLobby() {
  const { language, t } = useLanguage();
  const copy = uxCopyFor(language);

  return (
    <main id="main-content" tabIndex={-1} className="gm-page gm-lobby flex flex-1 flex-col px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-wrap items-start justify-between gap-3 md:max-w-2xl" dir="ltr">
        <LanguageSwitcher />
        <AuthMenu />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 pb-4 pt-10 md:max-w-2xl sm:gap-8 sm:pt-12">
        <header className="gm-lobby-hero flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-semibold text-zinc-500">Guess Meme</p>
          <h1 className="gm-lobby-title font-black">{t("title")}</h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>
        </header>

        <div className="flex flex-col items-center gap-2 text-center">
          <Link href="/play" className="gm-start flex min-h-14 w-full items-center justify-center rounded-2xl bg-zinc-950 px-6 py-3 text-lg font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
            {copy.start}
          </Link>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{copy.noLogin}</p>
          <p className="text-sm text-zinc-500">{t("casualHint")}</p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2" aria-label={t("challenge")}>
          <Link
            href="/challenge"
            className="gm-mode border-s-4 border-s-amber-500 group flex flex-col gap-2 rounded-2xl border border-amber-400/40 bg-amber-50 p-5 transition-colors hover:border-amber-500 active:scale-[0.99] dark:border-amber-300/30 dark:bg-amber-950/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">⚡ {t("challenge")}</h2>
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950">10s</span>
            </div>
            <p className="text-sm leading-6 text-zinc-700 dark:text-amber-100/80">{t("challengeHint")}</p>
          </Link>
          <Link
            href="/challenge?daily=1"
            className="gm-mode border-s-4 border-s-indigo-600 group flex flex-col gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-50 p-5 transition-colors hover:border-indigo-500 active:scale-[0.99] dark:border-indigo-300/20 dark:bg-indigo-950/30"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{copy.daily}</h2>
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">{copy.dailyBadge}</span>
            </div>
            <p className="text-sm leading-6 text-zinc-700 dark:text-indigo-100/80">{copy.dailyHint}</p>
          </Link>
          <PkEntry />

          <div
            aria-disabled="true"
            className="flex flex-col gap-2 rounded-2xl border border-dashed border-black/15 bg-zinc-100/80 p-5 text-zinc-500 sm:col-span-2 dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-400"
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

        <HonorCard showChallengeLink />

        <Link
          href="/create"
          className="flex min-h-14 items-center justify-center rounded-2xl border border-black/15 text-base font-semibold transition-transform active:scale-[0.99] dark:border-white/20"
        >
          📸 {t("create")}
        </Link>
      </div>
      <SiteFooter className="mx-auto w-full max-w-md pt-8 md:max-w-2xl" />
    </main>
  );
}
