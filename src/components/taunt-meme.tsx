"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const badges = ["🤡 小丑竟是我自己", "💔 連勝中斷！"];

const reportReasons = [
  "正解有爭議",
  "圖片太模糊/通靈",
  "選項重複或錯字",
  "其他問題",
] as const;

type ReportReason = (typeof reportReasons)[number];

const memes = [
  {
    label: "小丑",
    svg: (
      <svg viewBox="0 0 220 180" className="h-52 w-52" role="img" aria-label="小丑嘲諷">
        <defs>
          <radialGradient id="taunt-face-clown" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffe08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
        </defs>
        <circle cx="110" cy="96" r="62" fill="url(#taunt-face-clown)" />
        <path d="M62 78c16-28 80-28 96 0" fill="#fb7185" />
        <ellipse cx="86" cy="96" rx="14" ry="16" fill="#fff" />
        <ellipse cx="134" cy="96" rx="14" ry="16" fill="#fff" />
        <g className="animate-taunt-wiggle" style={{ transformOrigin: "110px 96px" }}>
          <circle cx="80" cy="98" r="6" fill="#111827" />
          <circle cx="142" cy="94" r="6" fill="#111827" />
        </g>
        <circle cx="110" cy="112" r="9" fill="#ef4444" />
        <path d="M84 128c10 16 42 16 52 0" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "心碎",
    svg: (
      <svg viewBox="0 0 220 180" className="h-52 w-52" role="img" aria-label="心碎嘲諷">
        <defs>
          <radialGradient id="taunt-face-heart" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#fecdd3" />
            <stop offset="100%" stopColor="#fb7185" />
          </radialGradient>
        </defs>
        <circle cx="110" cy="98" r="62" fill="url(#taunt-face-heart)" />
        <path d="M78 90c8-14 22-10 26 2 6-14 20-14 26 0" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <circle cx="92" cy="112" r="5" fill="#111827" />
        <circle cx="132" cy="112" r="5" fill="#111827" />
        <path d="M96 134h28" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <g className="animate-taunt-float">
          <path
            d="M168 34c-7-8-18-3-18 7 0 8 8 14 18 22 10-8 18-14 18-22 0-10-11-15-18-7z"
            fill="#ef4444"
          />
          <path d="M168 42l-5 8 7 3-5 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    ),
  },
  {
    label: "假笑",
    svg: (
      <svg viewBox="0 0 220 180" className="h-52 w-52" role="img" aria-label="假笑嘲諷">
        <defs>
          <radialGradient id="taunt-face-smirk" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ddd6fe" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </radialGradient>
        </defs>
        <circle cx="110" cy="96" r="62" fill="url(#taunt-face-smirk)" />
        <path d="M74 92c8-10 18-10 24 0" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <path d="M122 88c10-12 22-8 26 2" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <path d="M86 124c8 18 40 18 50-2" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <g className="animate-taunt-float">
          <circle cx="164" cy="118" r="7" fill="#bfdbfe" />
          <circle cx="172" cy="132" r="4" fill="#bfdbfe" />
        </g>
      </svg>
    ),
  },
  {
    label: "搖頭",
    svg: (
      <svg viewBox="0 0 220 180" className="h-52 w-52" role="img" aria-label="搖頭嘲諷">
        <defs>
          <radialGradient id="taunt-face-nope" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
        </defs>
        <g className="animate-taunt-wiggle" style={{ transformOrigin: "110px 96px" }}>
          <circle cx="110" cy="96" r="62" fill="url(#taunt-face-nope)" />
          <path d="M78 88l18 14M96 88L78 102M126 88l18 14M144 88l-18 14" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
          <path d="M92 128c8 8 28 8 36 0" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        </g>
      </svg>
    ),
  },
];

export const TAUNT_MEME_COUNT = memes.length;

export function TauntMeme({ index }: { index: number }) {
  const meme = memes[index % memes.length] ?? memes[0];
  return (
    <div className="relative mx-auto mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-800 to-zinc-900 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute inset-6 rounded-full bg-red-500/20 blur-2xl" />
      <div className="relative flex h-full items-center justify-center">
        {meme.svg}
      </div>
    </div>
  );
}

export function TauntDialog({
  taunt,
  index,
  questionId,
  onGiveUp,
}: {
  taunt: string;
  index: number;
  questionId: string;
  onGiveUp: () => void;
}) {
  const badge = badges[index % badges.length];
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportTick, setReportTick] = useState(0);

  useEffect(() => {
    if (!reportTick) return;
    const timeout = window.setTimeout(() => setReportTick(0), 2800);
    return () => window.clearTimeout(timeout);
  }, [reportTick]);

  function openReport() {
    setReason(null);
    setDetails("");
    setReportError("");
    setReportOpen(true);
  }

  function closeReport() {
    if (submitting) return;
    setReportOpen(false);
  }

  async function submitReport() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setReportError("");
    const { error } = await supabase.from("question_reports").insert({
      question_id: questionId,
      reason_category: reason,
      details: details.trim(),
    });
    setSubmitting(false);
    if (error) {
      setReportError("回報送出失敗，請再試一次");
      return;
    }
    setReportOpen(false);
    setReason(null);
    setDetails("");
    setReportTick((current) => current + 1);
  }

  return (
    <div className="animate-taunt-backdrop fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center">
      {reportTick > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <p
            key={reportTick}
            role="status"
            className="animate-toast-in rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            已收到回報，我們會盡快審核！
          </p>
        </div>
      ) : null}
      <div
        role="dialog"
        aria-modal={reportOpen ? undefined : true}
        aria-labelledby="taunt-title"
        inert={reportOpen}
        className="animate-taunt-pop w-full max-w-sm rounded-2xl border border-red-500/30 bg-zinc-950 p-5 text-zinc-50 shadow-2xl shadow-red-500/20"
      >
        <h2 id="taunt-title" className="text-center text-2xl font-extrabold tracking-tight text-red-400">
          {badge}
        </h2>
        <TauntMeme index={index} />
        <blockquote className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-center text-xl font-bold leading-8 text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.22)]">
          「{taunt}」
        </blockquote>
        <button
          type="button"
          autoFocus
          onClick={onGiveUp}
          className="mt-5 h-14 w-full rounded-2xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition duration-150 hover:brightness-110 active:scale-95"
        >
          認輸，換下一題 ➜
        </button>
        <button
          type="button"
          onClick={openReport}
          className="mt-3 w-full text-center text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
        >
          🚩 題目有爭議？回報糾錯
        </button>
      </div>

      {reportOpen ? (
        <div className="animate-taunt-backdrop fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            className="animate-taunt-pop max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 text-zinc-50 shadow-2xl"
          >
            <h2 id="report-title" className="text-xl font-bold">
              回報這題
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-2">
              {reportReasons.map((item) => {
                const selected = reason === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selected}
                    disabled={submitting}
                    onClick={() => setReason(item)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      selected
                        ? "border-red-400 bg-red-500/20 text-white"
                        : "border-white/10 bg-zinc-900 text-zinc-200 hover:border-white/25"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="請具體告訴我們哪裡有問題（選填）..."
              rows={4}
              maxLength={500}
              disabled={submitting}
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm leading-6 text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-red-400/60"
            />
            {reportError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {reportError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!reason || submitting}
              onClick={() => void submitReport()}
              className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-red-500 to-orange-400 text-sm font-bold text-white transition disabled:opacity-50 active:scale-95"
            >
              {submitting ? "送出中…" : "送出回報"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={closeReport}
              className="mt-2 h-12 w-full rounded-xl text-sm font-medium text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
