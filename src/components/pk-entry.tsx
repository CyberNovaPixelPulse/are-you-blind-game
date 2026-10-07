"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { supabase } from "@/lib/supabase";

export function PkEntry() {
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

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void enter()}
        className="flex w-full flex-col gap-2 rounded-3xl border border-rose-400/40 bg-rose-50 p-5 text-left shadow-lg shadow-rose-500/10 transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60 dark:border-rose-300/30 dark:bg-rose-950/40"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">⚔️ {t("pk")}</h2>
          <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
            {pending ? "前往中" : "2–4 人"}
          </span>
        </div>
        <p className="text-sm leading-6 text-zinc-700 dark:text-rose-100/80">
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
