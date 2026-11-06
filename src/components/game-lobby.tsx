"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AuthMenu } from "@/components/auth-menu";
import { HonorCard } from "@/components/honor-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/components/language-provider";
import { PkEntry } from "@/components/pk-entry";
import { uxCopyFor } from "@/lib/ux-copy";
import styles from "./game-lobby.module.css";

type LobbyCopy = { steps: [string, string, string]; stepsLabel: string; sticker: string; modes: string; sample: string; alt: string };

// Lobby-only poster copy. Languages without an entry simply skip the how-to strip and sticker text.
const LOBBY_COPY: Partial<Record<string, LobbyCopy>> = {
  "zh-TW": { steps: ["看特寫", "四選一", "猜錯被嘲"], stepsLabel: "玩法", sticker: "這是什麼？", modes: "其他玩法", sample: "示意題圖", alt: "皮革紋理與接縫的特寫，示範猜圖玩法" },
  "zh-CN": { steps: ["看特写", "四选一", "猜错被嘲"], stepsLabel: "玩法", sticker: "这是什么？", modes: "其他玩法", sample: "示意题图", alt: "皮革纹理与接缝的特写，示范猜图玩法" },
  en: { steps: ["See a close-up", "Pick 1 of 4", "Miss, get roasted"], stepsLabel: "How to play", sticker: "What is it?", modes: "More modes", sample: "Illustrative question", alt: "A close-up of leather grain and stitching illustrating the guessing game" },
};

export function GameLobby() {
  const { language, t } = useLanguage();
  const copy = uxCopyFor(language);
  const lobby = LOBBY_COPY[language];
  const sampleLang = lobby ? language : "en";
  const sample = lobby ?? LOBBY_COPY.en!;

  return (
    <main id="main-content" tabIndex={-1} className={styles.lobby}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>AreYouBlind</Link>
          <div className={styles.utilities} dir="ltr"><LanguageSwitcher /><AuthMenu /></div>
        </header>

        <div className={styles.stage}>
          <div className={styles.intro}>
            <h1 className={styles.heading}>{t("title")}</h1>
            <p className={styles.tagline}>{t("tagline")}</p>
            {lobby ? (
              <ol className={styles.steps} aria-label={lobby.stepsLabel}>
                {lobby.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            ) : null}
            <div className={styles.photoWrap}>
              <figure className={styles.photo}>
                <Image src="/images/lobby-leather.webp" alt={sample.alt} lang={sampleLang} fill priority sizes="(min-width: 900px) 46vw, 100vw" />
                <figcaption lang={sampleLang}>{sample.sample}</figcaption>
              </figure>
              {lobby ? <span className={styles.sticker} aria-hidden="true">{lobby.sticker}</span> : null}
            </div>
          </div>

          <div className={styles.actions}>
            <div className={styles.startArea}>
              <Link href="/play" className={styles.start}>{copy.start}<ChevronRight aria-hidden="true" className={styles.startIcon} /></Link>
              <p className={styles.noLogin}>{copy.noLogin}</p>
            </div>

            <section className={styles.modesSection} aria-labelledby={lobby ? "lobby-modes" : undefined} aria-label={lobby ? undefined : t("casual")}>
              {lobby ? <p id="lobby-modes" className={styles.modesTitle}>{lobby.modes}</p> : null}
              <div className={styles.modes}>
                <Link href="/play" className={styles.mode}>
                  <span className={styles.marker} aria-hidden="true" />
                  <div><h2>{t("casual")}</h2><p>{t("casualHint")}</p></div>
                </Link>
                <Link href="/challenge?daily=1" className={styles.mode}>
                  <span className={styles.marker} aria-hidden="true" />
                  <div><h2>{copy.daily} <span className={styles.badge}>{copy.dailyBadge}</span></h2><p>{copy.dailyHint}</p></div>
                </Link>
                <Link href="/challenge" className={styles.mode}>
                  <span className={styles.marker} aria-hidden="true" />
                  <div><h2>{t("challenge")}</h2><p>{t("challengeHint")}</p></div>
                </Link>
                <PkEntry appearance="lobby" className={styles.mode} markerClassName={styles.marker} />
              </div>
            </section>

            <div className={styles.secondary}>
              <Link href="/create" className={styles.create}>{t("create")}<ChevronRight aria-hidden="true" size={18} /></Link>
              <aside className={styles.comingSoon}><span>{t.themeCard.title}</span><span>{t.themeCard.subtitle}</span></aside>
            </div>
            <div className={styles.honor}><HonorCard appearance="lobby" /></div>
          </div>
        </div>

        <footer className={styles.footer}>
          <nav aria-label="網站資訊"><Link href="/guidelines">出題規範</Link><Link href="/terms">服務條款與免責聲明</Link></nav>
          <p>© 2026 AreYouBlind</p>
        </footer>
      </div>
    </main>
  );
}
