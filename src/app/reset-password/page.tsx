"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/language-provider";
import { accountCopyFor } from "@/lib/account-copy";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const { language } = useLanguage();
  const { text: copy, lang } = accountCopyFor(language);
  const [mode, setMode] = useState<"loading" | "request" | "update" | "done">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<"expired" | "sendError" | "updateError" | "short" | "mismatch" | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const invalidLink = params.has("error") || new URLSearchParams(window.location.search).has("error");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setMode("update");
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || invalidLink) setError("expired");
      setMode(data.session ? "update" : "request");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setSent(false);
    if (mode === "update" && password.length < 6) { setError("short"); passwordRef.current?.focus(); return; }
    if (mode === "update" && password !== confirmation) { setError("mismatch"); confirmationRef.current?.focus(); return; }
    setPending(true);
    try {
      if (mode === "request") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setError("sendError");
        else setSent(true);
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) setError("updateError");
        else { setPassword(""); setConfirmation(""); setMode("done"); }
      }
    } catch {
      setError(mode === "request" ? "sendError" : "updateError");
    } finally { setPending(false); }
  }

  const fieldClass = "min-h-11 rounded-xl border border-black/20 bg-transparent px-3 py-2 dark:border-white/25";
  return (
    <main id="main-content" tabIndex={-1} lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className="gm-page gm-workspace gm-form-page mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/create" className="inline-flex min-h-11 w-fit items-center underline underline-offset-4">{copy.back}</Link>
      <h1 className="text-3xl">{copy.title}</h1>
      {mode === "loading" ? <p role="status">{copy.loading}</p> : mode === "done" ? (
        <p role="status">{copy.done}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending}>
          {mode === "request" ? <>
            <p>{copy.hint}</p>
            <label className="flex flex-col gap-2">{copy.email}
              <input type="email" name="email" spellCheck={false} autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={pending} className={fieldClass} />
            </label>
          </> : <>
            <p id="password-hint">{copy.passwordHint}</p>
            <label className="flex flex-col gap-2">{copy.password}
              <input ref={passwordRef} name="new-password" type="password" autoComplete="new-password" required minLength={6} aria-invalid={error === "short"} aria-describedby={error === "short" ? "password-hint reset-error" : "password-hint"} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-2">{copy.confirm}
              <input ref={confirmationRef} name="confirm-password" type="password" autoComplete="new-password" required minLength={6} aria-invalid={error === "mismatch"} aria-describedby={error === "mismatch" ? "reset-error" : undefined} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} className={fieldClass} />
            </label>
          </>}
          {error ? <p id="reset-error" role="alert">{copy[error]}</p> : null}
          <p role="status" className="empty:hidden">{pending ? copy.working : sent ? copy.sent : ""}</p>
          <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-50">
            {mode === "request" ? copy.send : copy.save}
          </button>
          {mode === "update" ? <button type="button" disabled={pending} onClick={() => { setMode("request"); setPassword(""); setConfirmation(""); setError(null); }} className="min-h-11 underline underline-offset-4">{copy.requestAgain}</button> : null}
        </form>
      )}
    </main>
  );
}
