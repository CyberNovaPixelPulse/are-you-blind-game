"use client";

import { useActionState, useEffect, useState } from "react";
import { unlockAdmin, type UnlockState } from "@/app/admin/actions";
import { clearAdminClientCache } from "@/app/admin/admin-client-cache";

const initialState: UnlockState = { error: "", nonce: "" };

export function AdminGate() {
  const [state, submit, pending] = useActionState(unlockAdmin, initialState);
  const [key, setKey] = useState("");

  useEffect(() => {
    clearAdminClientCache();
  }, []);

  useEffect(() => {
    if (!state.nonce) return;
    clearAdminClientCache();
    setKey("");
  }, [state.nonce]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <form
        action={submit}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold">管理金鑰</h1>
        <p className="mt-2 text-sm text-zinc-500">只接受本機開發環境。</p>
        <label className="mt-5 flex flex-col gap-2 text-sm font-medium">
          金鑰
          <input
            name="key"
            type="password"
            autoComplete="current-password"
            required
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
          />
        </label>
        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-600 bg-red-600/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400"
          >
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-50"
        >
          {pending ? "驗證中…" : "進入"}
        </button>
      </form>
    </main>
  );
}
