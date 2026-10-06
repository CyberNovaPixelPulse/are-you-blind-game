"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

const AD_SECONDS = 5;

export function usePlayerVip() {
  const [isVip, setIsVip] = useState(false);
  const [vipReady, setVipReady] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId) {
        if (!active) return;
        setIsVip(false);
        setVipReady(true);
        return;
      }
      void supabase
        .from("profiles")
        .select("is_vip")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile, error }) => {
          if (!active) return;
          setIsVip(!error && profile?.is_vip === true);
          setVipReady(true);
        });
    });
    return () => {
      active = false;
    };
  }, []);

  return { isVip, vipReady };
}

export function AdModal({ open, onComplete }: { open: boolean; onComplete: () => void }) {
  const [seconds, setSeconds] = useState(AD_SECONDS);
  const [mounted, setMounted] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const doneRef = useRef(false);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSeconds(AD_SECONDS);
      doneRef.current = false;
      return;
    }
    doneRef.current = false;
    setSeconds(AD_SECONDS);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, AD_SECONDS - Math.floor((Date.now() - started) / 1000));
      setSeconds(left);
      if (left > 0 || doneRef.current) return;
      doneRef.current = true;
      window.clearInterval(timer);
      onCompleteRef.current();
    }, 200);
    return () => window.clearInterval(timer);
  }, [open]);

  function finish() {
    if (seconds > 0 || doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md"
      role="presentation"
      onClick={finish}
    >
      <p className="absolute top-4 right-4 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white tabular-nums">
        廣告剩餘 {seconds} 秒
      </p>
      <div className="flex h-full items-center justify-center px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ad-modal-title"
          className="w-full max-w-sm rounded-3xl bg-zinc-900 p-4 text-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-xs font-bold tracking-[0.22em] text-amber-300">AD</p>
          <div className="mt-3 flex aspect-video items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3f3f46,#18181b_55%,#7f1d1d)]">
            <span className="rounded-full bg-black/40 px-3 py-1 text-sm font-semibold">廣告版位</span>
          </div>
          <h2 id="ad-modal-title" className="mt-4 text-lg font-black">
            贊助展示
          </h2>
          <p className="mt-1 text-sm text-zinc-400">倒數結束後會回到遊戲。</p>
          <button
            type="button"
            disabled={seconds > 0}
            onClick={finish}
            className="mt-4 h-11 w-full rounded-full bg-white text-sm font-bold text-zinc-950 disabled:opacity-40"
          >
            略過廣告
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
