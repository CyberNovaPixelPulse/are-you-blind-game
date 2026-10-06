"use client";

import { toBlob } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

const SHARE_HOST = "areyoublind.game";
const SHARE_URL = "https://areyoublind.game";

export type ShameReport = {
  mode: "classic" | "challenge";
  questionNumber?: number;
  score?: number;
  cropUrl: string;
  pickedText: string;
  answerText: string;
  taunt: string;
};

function clipName(value: string) {
  const text = [...value.trim()].slice(0, 40).join("");
  return text || "玩家";
}

function initial(name: string) {
  return [...name.trim()][0] || "玩";
}

function headline(report: ShameReport) {
  if (report.mode === "challenge") {
    const score = report.score ?? 0;
    return `⚡ 極速挑戰斬獲 ${score.toLocaleString("zh-TW")} 分`;
  }
  const number = report.questionNumber && report.questionNumber > 0 ? report.questionNumber : 1;
  return `💔 屈辱終結！第 ${number} 題被看破`;
}

function isMobile() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function toDataUrl(url: string) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function waitForImages(node: HTMLElement) {
  const images = [...node.querySelectorAll("img")];
  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

function BattleReportCard({
  report,
  name,
  avatarSrc,
  cropSrc,
}: {
  report: ShameReport;
  name: string;
  avatarSrc: string | null;
  cropSrc: string;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [cropFailed, setCropFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  useEffect(() => {
    setCropFailed(false);
  }, [cropSrc]);

  return (
    <article
      className="flex h-[640px] w-[360px] flex-col overflow-hidden rounded-[28px] border border-red-500/60 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(239,68,68,0.62),rgba(0,0,0,0)_56%),linear-gradient(180deg,#3a0b12_0%,#12060a_38%,#050505_100%)] p-5 text-white shadow-[0_0_48px_rgba(239,68,68,0.55)]"
      style={{ fontFamily: 'Arial, "PingFang TC", "Noto Sans TC", sans-serif' }}
    >
      <p className="text-center text-sm font-black tracking-wide text-red-100">你瞎了嗎？AreYouBlind</p>
      <div className="mt-4 flex items-center gap-3">
        {avatarSrc && !avatarFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            crossOrigin="anonymous"
            data-avatar="true"
            onError={() => setAvatarFailed(true)}
            className="h-11 w-11 rounded-full border border-amber-300/80 object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/80 bg-zinc-900 text-lg font-black text-amber-100">
            {initial(name)}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-base font-bold">{name}</p>
      </div>
      <h2 className="mt-3 text-xl leading-8 font-black text-white">{headline(report)}</h2>
      <div className="mt-3 h-[188px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
        {cropSrc && !cropFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cropSrc}
            alt=""
            crossOrigin="anonymous"
            onError={() => setCropFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">特寫準備中</div>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <div className="rounded-xl bg-red-600 px-3 py-2 text-white">
          <p className="text-[11px] font-bold tracking-wide">❌ 我猜是這個</p>
          <p className="mt-0.5 line-clamp-2 text-sm font-black">{report.pickedText}</p>
        </div>
        <div className="rounded-xl bg-emerald-500 px-3 py-2 text-emerald-950">
          <p className="line-clamp-2 text-sm font-black">正解其實是：{report.answerText}</p>
        </div>
      </div>
      <blockquote className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/15 px-3 py-3 text-center">
        <p className="line-clamp-4 text-lg leading-7 font-black text-amber-100">「{report.taunt}」</p>
      </blockquote>
      <footer className="mt-3 text-center">
        <p className="text-xs text-zinc-400">不服來戰！看看你的眼力有多瞎</p>
        <p className="mt-1 text-sm font-black tracking-wide text-zinc-200">{SHARE_HOST}</p>
      </footer>
    </article>
  );
}

export function ShareShameButton({ report }: { report: ShameReport }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [toast, setToast] = useState("");
  const [name, setName] = useState("玩家");
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState(report.cropUrl);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user || !active) return;
      const profile = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      const meta = user.user_metadata ?? {};
      const fromProfile = typeof profile.data?.username === "string" ? profile.data.username : "";
      const fromMeta = String(meta.full_name || meta.name || "");
      const fromEmail = user.email?.split("@")[0] ?? "";
      const avatarValue = profile.data?.avatar_url || meta.avatar_url || meta.picture || null;
      const avatarUrl = typeof avatarValue === "string" && avatarValue.trim() ? avatarValue : null;
      setName(clipName(fromProfile || fromMeta || fromEmail));
      if (!avatarUrl) return;
      const dataUrl = await toDataUrl(avatarUrl);
      if (active) setAvatarSrc(dataUrl);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setCropSrc(report.cropUrl);
    void toDataUrl(report.cropUrl).then((dataUrl) => {
      if (active && dataUrl) setCropSrc(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [report.cropUrl]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function share() {
    const node = cardRef.current;
    if (!node || rendering) return;
    setRendering(true);
    setToast("");
    try {
      await waitForImages(node);
      const blob = await toBlob(node, {
        width: 360,
        height: 640,
        canvasWidth: 720,
        canvasHeight: 1280,
        pixelRatio: 2,
        backgroundColor: "#050505",
        skipFonts: true,
        cacheBust: true,
      });
      if (!blob) throw new Error("empty");
      const file = new File([blob], "areyoublind-shame.png", { type: "image/png" });
      const canNativeShare =
        isMobile() &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canNativeShare) {
        try {
          await navigator.share({
            files: [file],
            title: "你瞎了嗎？",
            text: `不服來戰！看看你的眼力有多瞎 ${SHARE_URL}`,
          });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "areyoublind-shame.png";
      link.click();
      URL.revokeObjectURL(url);
      setToast("戰報圖片已儲存，快貼到社群互相傷害！");
    } catch {
      setToast("戰報沒有生成，請再試一次");
    } finally {
      setRendering(false);
    }
  }

  const stage =
    typeof document === "undefined"
      ? null
      : createPortal(
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 -z-10"
              style={{ transform: "translateX(-120vw)" }}
            >
              <div ref={cardRef}>
                <BattleReportCard report={report} name={name} avatarSrc={avatarSrc} cropSrc={cropSrc} />
              </div>
            </div>
            {toast ? (
              <div className="pointer-events-none fixed inset-x-0 top-6 z-[120] flex justify-center px-4">
                <p role="status" className="animate-toast-in rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
                  {toast}
                </p>
              </div>
            ) : null}
          </>,
          document.body,
        );

  return (
    <>
      <button
        type="button"
        disabled={rendering}
        onClick={() => void share()}
        className="h-12 w-full rounded-full bg-gradient-to-r from-fuchsia-500 via-red-500 to-orange-400 text-sm font-black text-white shadow-[0_0_24px_rgba(244,63,94,0.7)] transition disabled:opacity-70"
      >
        {rendering ? "戰報渲染中..." : "📸 分享我的屈辱（生成戰報）"}
      </button>
      {stage}
    </>
  );
}
