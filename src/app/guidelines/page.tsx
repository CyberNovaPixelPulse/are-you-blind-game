import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "出題與審查規範",
  description: "局部猜謎的 100 分制審核標準，滿 60 分才能發布。",
};

const criteria = [
  {
    score: "40 分",
    title: "盲猜可解性",
    summary: "不能是純色塊或通靈題。",
    points: [
      "AI 會先不看正解，只看特寫連猜 3 次。",
      "第 1 或第 2 次猜中名稱，得 40 分。",
      "三次之內猜中同一個大類別，得 25 分。",
      "名稱猜偏，但顏色、形狀或材質聯想合理，得 10 分。",
      "純色塊、沒有可辨識輪廓，得 0 分。",
    ],
  },
  {
    score: "25 分",
    title: "視覺特徵與畫質",
    summary: "特寫要清楚，看得到邊緣。",
    points: [
      "紋理、輪廓邊緣和畫質都清楚，可以拿到滿分。",
      "極度模糊，或只剩一塊顏色，只給 0 到 5 分。",
      "裁切時留下能辨認的邊緣，不要框成一片色塊。",
    ],
  },
  {
    score: "20 分",
    title: "干擾項與毒舌評語",
    summary: "選項限 8 字，毒舌評語限 40 字。",
    points: [
      "三個干擾項必須和正解同一個類別，句型也要對稱。",
      "選項文字 8 字以內。狗的部位就配其他犬種，名人的眼睛就配其他名人的眼睛。",
      "毒舌評語要一句話、40 字以內，並點出這個選項和正解差在哪。",
    ],
  },
  {
    score: "15 分",
    title: "社群安全",
    summary: "違規會讓總分歸零。",
    points: [
      "沒有色情、血腥暴力，也沒有身分證、護照、信用卡等個資，得 15 分。",
      "碰到其中任何一項，這一項直接 0 分，總分也強制歸零。",
      "這是一票否決，分數再高也不能發布。",
    ],
  },
] as const;

export default function GuidelinesPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">出題與審查規範</h1>
          <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            發布前會用 100 分制看這題。滿 60 分，而且沒有安全問題，才會寫進題庫。
          </p>
        </div>
      </header>

      <section className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950">
        <p className="text-sm font-semibold">通過門檻</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          四項加總 0 到 100 分。60 分以上可以發布。低於 60 分會停在出題頁，並附上盲猜結果和改善建議。
        </p>
      </section>

      <ol className="flex flex-col gap-3">
        {criteria.map((item, index) => (
          <li
            key={item.title}
            className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {index + 1}. {item.title}
              </h2>
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                {item.score}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">{item.summary}</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
