"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { supabase } from "@/lib/supabase";

export function PkEntry({ appearance, className, markerClassName }: { appearance?: "lobby"; className?: string; markerClassName?: string } = {}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    setPending(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/pk` },
      });
      if (signInError) {
        setError("Google 登入失敗，請再試一次");
        setPending(false);
      }
      return;
    }
    router.push("/pk");
    setPending(false);
  }

  if (appearance === "lobby") return (
    <div>
      <button type="button" disabled={pending} onClick={() => void enter()} className={className}>
        <span aria-hidden="true" className={markerClassName} />
        <div><h2>{t("pk")}</h2><p>{pending ? "前往中…" : t("pkHint")}</p></div>
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void enter()}
        className=" flex w-full flex-col gap-2 rounded-2xl border border-game-line bg-game-panel p-5 text-left transition-colors hover:border-game-accent active:scale-[0.99] disabled:opacity-60 dark:border-game-line dark:bg-game-panel"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t("pk")}</h2>
          <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
            {pending ? "前往中" : "2–4 人"}
          </span>
        </div>
        <p className="text-sm leading-6 text-zinc-700 dark:text-game-muted">
          {t("pkHint")}
        </p>
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
