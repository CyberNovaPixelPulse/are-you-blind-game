"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLanguage } from "@/components/language-provider";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/lib/supabase";

type Profile = {
  username: string;
  avatar_url: string | null;
  is_vip: boolean;
};

function metadataName(user: User): string {
  const meta = user.user_metadata ?? {};
  const raw = meta.full_name || meta.name || "";
  const name = String(raw).trim();
  if (name) return name.slice(0, 40);
  const email = user.email?.split("@")[0]?.trim();
  return email || "玩家";
}

function metadataAvatar(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const url = meta.avatar_url || meta.picture || "";
  return typeof url === "string" && url.trim() ? url : null;
}

export function AuthMenu() {
  const { t } = useLanguage();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
    if (!user) {
      setProfile(null);
      setUsername("");
      return;
    }

    let active = true;
    const fallback = metadataName(user);
    setUsername((current) => current || fallback);

    void supabase
      .from("profiles")
      .select("username, avatar_url, is_vip")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (!active || profileError || !data) return;
        const next: Profile = {
          username: data.username,
          avatar_url: data.avatar_url,
          is_vip: data.is_vip === true,
        };
        setProfile(next);
        setUsername(next.username);
      });

    return () => {
      active = false;
    };
  }, [user]);

  async function signInWithGoogle() {
    setError("");
    setPending(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (signInError) {
      setError("Google 登入失敗，請再試一次");
      setPending(false);
    }
  }

  async function saveProfile() {
    if (!user) return;
    const next = username.trim();
    if (next.length < 1 || next.length > 40) {
      setError("暱稱需要 1 到 40 個字");
      return;
    }
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username: next })
      .eq("id", user.id);
    setSaving(false);
    if (updateError) {
      setError("暱稱儲存失敗，請再試一次");
      return;
    }
    setProfile((current) =>
      current
        ? { ...current, username: next }
        : {
            username: next,
            avatar_url: metadataAvatar(user),
            is_vip: false,
          },
    );
    setOpen(false);
  }

  async function signOut() {
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError("登出失敗，請再試一次");
      return;
    }
    setOpen(false);
  }

  const displayName = profile?.username || (user ? metadataName(user) : "");
  const avatarUrl = profile?.avatar_url || (user ? metadataAvatar(user) : null);
  const isVip = profile?.is_vip === true;

  if (!ready) {
    return <div className="h-10 w-36" aria-hidden="true" />;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {user ? (
        <button
          type="button"
          onClick={() => {
            setError("");
            setUsername(displayName);
            setOpen(true);
          }}
          className="flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white py-1 pr-3 pl-1 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-950 dark:hover:bg-zinc-900"
        >
          <UserAvatar
            src={avatarUrl}
            name={displayName}
            className={`h-8 w-8 text-sm ${isVip ? "ring-2 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]" : ""}`}
          />
          <span className="max-w-32 truncate">{displayName}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!ready || pending}
          onClick={signInWithGoogle}
          className="h-10 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {t("login")}
        </button>
      )}
      {error && !open ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {open && user ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-settings-title"
            className="w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-950 shadow-xl dark:bg-zinc-950 dark:text-zinc-50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="profile-settings-title" className="text-xl font-semibold">
                個人設定
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-full px-3 text-sm font-medium text-zinc-500 hover:bg-black/[.04] dark:hover:bg-white/[.08]"
              >
                關閉
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/profile");
              }}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              🎨 我出的題目
            </button>

            <div className="mt-4 flex justify-center">
              <UserAvatar
                src={avatarUrl}
                name={displayName}
                className={`h-20 w-20 text-2xl ${isVip ? "ring-2 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]" : ""}`}
              />
            </div>

            <label className="mt-4 flex flex-col gap-1 text-sm font-medium">
              暱稱
              <input
                value={username}
                maxLength={40}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 rounded-xl border border-black/10 bg-transparent px-3 font-normal outline-none focus:border-zinc-950 dark:border-white/15 dark:focus:border-zinc-50"
              />
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={saveProfile}
                className="h-10 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
              >
                {saving ? "儲存中…" : "儲存暱稱"}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="h-10 rounded-full border border-black/10 px-4 text-sm font-medium dark:border-white/15"
              >
                登出
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
