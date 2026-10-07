"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { readStoredOptions } from "@/lib/question-options";
import { quizImageUrl } from "@/lib/quiz-image";
import { supabase } from "@/lib/supabase";

type Work = {
  id: string;
  cropImagePath: string;
  answer: string;
  createdAt: string;
  status: string;
  viewCount: number;
};

function publicImageUrl(path: string) {
  return quizImageUrl(path);
}

function missingViewCount(message: string) {
  return message.toLowerCase().includes("view_count");
}

function statusLabel(status: string) {
  if (status === "active") return "上線中";
  if (status === "hidden") return "未上線";
  return "審核中";
}

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "hidden") return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function readAnswer(options: unknown) {
  const correct = readStoredOptions(options).find((option) => option.isCorrect);
  return correct?.text.trim() || "尚未填寫正解";
}

function readCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) return 0;
  return count;
}

function readWorks(rows: Record<string, unknown>[], viewsAvailable: boolean): Work[] {
  return rows.flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.crop_image_path !== "string") return [];
    return [
      {
        id: row.id,
        cropImagePath: row.crop_image_path,
        answer: readAnswer(row.options),
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        status: typeof row.status === "string" ? row.status : "review",
        viewCount: viewsAvailable ? readCount(row.view_count) : 0,
      },
    ];
  });
}

export function MyQuestions() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [works, setWorks] = useState<Work[]>([]);
  const [viewsReady, setViewsReady] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setWorks([]);
      setStatus("ready");
      return;
    }

    let active = true;
    setStatus("loading");

    void (async () => {
      const columns = "id, crop_image_path, options, created_at, status, view_count";
      const scored = await supabase
        .from("questions")
        .select(columns)
        .eq("author_id", user.id)
        .order("created_at", { ascending: false });

      let rows = (scored.data ?? []) as Record<string, unknown>[];
      let viewsAvailable = true;
      let failed = scored.error?.message ?? "";

      if (scored.error && missingViewCount(scored.error.message)) {
        viewsAvailable = false;
        const plain = await supabase
          .from("questions")
          .select("id, crop_image_path, options, created_at, status")
          .eq("author_id", user.id)
          .order("created_at", { ascending: false });
        rows = (plain.data ?? []) as Record<string, unknown>[];
        failed = plain.error?.message ?? "";
      }

      if (!active) return;
      if (failed) {
        setStatus("error");
        return;
      }
      setViewsReady(viewsAvailable);
      setWorks(readWorks(rows, viewsAvailable));
      setStatus("ready");
    })();

    return () => {
      active = false;
    };
  }, [ready, user]);

  const totalViews = works.reduce((sum, work) => sum + work.viewCount, 0);
  const averageViews = works.length > 0 ? Math.round(totalViews / works.length) : 0;
  const hottest = works.reduce((max, work) => Math.max(max, work.viewCount), 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 px-3 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
        >
          <span aria-hidden="true">←</span>
          返回首頁
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase">Creator</p>
        <h1 className="text-3xl font-black tracking-tight">我出的題目</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">看看自己的題目有沒有被抽到、被看過幾次。</p>
      </header>

      {!ready || status === "loading" ? <p className="text-sm text-zinc-500">正在讀取你的題目…</p> : null}

      {ready && !user ? (
        <section className="rounded-3xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-950">
          <p className="text-base font-medium">登入後就能查看自己出的題目與曝光成效。</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            回到首頁登入
          </Link>
        </section>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          題目清單讀取失敗，請再試一次。
        </p>
      ) : null}

      {status === "ready" && user && works.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-black/15 bg-white p-6 text-center dark:border-white/20 dark:bg-zinc-950">
          <p className="text-lg font-semibold">你還沒出過題，立即去出題秀操作！</p>
          <Link
            href="/create"
            className="mt-4 inline-flex h-12 items-center rounded-full bg-zinc-950 px-5 text-base font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            📸 我要出題
          </Link>
        </section>
      ) : null}

      {status === "ready" && user && works.length > 0 ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="創作者數據">
            <article className="rounded-3xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-950">
              <p className="text-sm text-zinc-500">總出題數</p>
              <p className="mt-1 text-3xl font-black">{works.length} 道</p>
            </article>
            <article className="rounded-3xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-950">
              <p className="text-sm text-zinc-500">總曝光 / 瀏覽次數</p>
              <p className="mt-1 text-3xl font-black">👁️ {totalViews.toLocaleString("zh-TW")} 次</p>
            </article>
            <article className="rounded-3xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-950">
              <p className="text-sm text-zinc-500">平均瀏覽量</p>
              <p className="mt-1 text-3xl font-black">{averageViews.toLocaleString("zh-TW")} 次</p>
              {hottest > 0 ? (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  最熱門 {hottest.toLocaleString("zh-TW")} 次
                </p>
              ) : null}
            </article>
          </section>

          {viewsReady ? null : (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              瀏覽量欄位還沒建立，數字會在執行曝光計數 SQL 後開始累計。
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {works.map((work) => (
              <li
                key={work.id}
                className="flex gap-4 rounded-3xl border border-black/10 bg-white p-3 dark:border-white/15 dark:bg-zinc-950"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-900">
                  <Image
                    src={publicImageUrl(work.cropImagePath)}
                    alt="題目特寫"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(work.status)}`}>
                      {statusLabel(work.status)}
                    </span>
                    {hottest > 0 && work.viewCount === hottest ? (
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                        熱門
                      </span>
                    ) : null}
                    <span className="text-xs text-zinc-500">{formatDate(work.createdAt)}</span>
                  </div>
                  <p className="truncate text-lg font-bold">{work.answer}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-white/10">
                      👁️ 瀏覽量：{work.viewCount.toLocaleString("zh-TW")} 次
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-400 dark:bg-white/10 dark:text-zinc-500">
                      👍 0 人好評 / 踩
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
