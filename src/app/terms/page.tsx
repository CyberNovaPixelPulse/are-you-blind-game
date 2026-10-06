import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "服務條款與免責聲明",
  description: "AreYouBlind 的服務性質、著作權通知、出題守則與廣告 Cookie 說明。",
};

const sections = [
  {
    id: "service",
    title: "1. 服務性質與免責聲明",
    paragraphs: [
      "AreYouBlind（你瞎了嗎？）是一個看局部圖猜物件的休閒娛樂服務。題目來自使用者自行上傳，以及站內演算法自動產出，目的是讓人玩猜謎，不是提供鑑定、教學或事實查核。",
      "題目的名稱、選項與圖片不保證絕對正確、完整或即時。你在遊戲中看到的答案只代表該題當時的設定，不能當成專業意見或商業依據。因使用本服務或相信題目內容而產生的損失，本站不負賠償責任。",
    ],
  },
  {
    id: "copyright",
    title: "2. 版權與 DMCA 避風港機制",
    paragraphs: [
      "本站恪守避風港原則。使用者上傳的題圖由上傳者自行負責，本站在知悉具體侵權通知並完成核實前，不對個別素材預先審查。",
    ],
  },
  {
    id: "upload",
    title: "3. 使用者出題守則",
    paragraphs: [
      "出題時，你必須對上傳的圖片與文字擁有合法使用權。嚴禁上傳涉及個人資料或證件、色情、暴力、誹謗，或其他你沒有授權的素材。",
      "違反上述守則者，本站得直接封禁帳號並移除相關題目。因此產生的法律責任由上傳者自行承擔。",
    ],
  },
  {
    id: "privacy",
    title: "4. 隱私權與第三方廣告 Cookie 政策",
    paragraphs: [
      "本站可能透過 Google AdSense 等第三方廣告聯播網投放廣告。這些廣告商可能使用 Cookie 或類似技術，收集非敏感的瀏覽資訊，例如你大約看過哪些頁面，用來估算廣告成效並優化體驗。",
      "這類 Cookie 由廣告合作方依其自身政策設置，不用來向本站索取你的密碼或證件資料。你也可以在瀏覽器設定中限制或清除 Cookie。繼續使用本站，即表示你理解本服務會出現上述第三方廣告。",
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          aria-label="返回首頁"
          className="inline-flex h-9 w-fit items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-zinc-950 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
        >
          <span aria-hidden="true">←</span>
          返回首頁
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase">AreYouBlind</p>
          <h1 className="text-3xl font-black tracking-tight">服務條款與免責聲明</h1>
          <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            使用本站的猜題、出題與挑戰功能，即表示你已閱讀並同意下列說明。
          </p>
        </div>
      </header>

      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950"
        >
          <h2 className="text-lg font-bold">{section.title}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                {paragraph}
              </p>
            ))}
            {section.id === "copyright" ? (
              <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                若你發現題圖侵害你的智慧財產權，請來信官方信箱{" "}
                <a
                  href="mailto:contact@areyoublind.game"
                  className="font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-4 dark:text-zinc-200"
                >
                  contact@areyoublind.game
                </a>
                ，或寄到站長信箱。來信請附上：權利說明、涉嫌侵權的題目位置，以及你的聯絡方式。核實後，本站將於 24 小時內下架該題。
              </p>
            ) : null}
          </div>
        </section>
      ))}

      <SiteFooter className="pt-4" />
    </main>
  );
}
