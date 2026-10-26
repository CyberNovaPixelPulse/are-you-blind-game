"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { LANGUAGES } from "@/lib/languages";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const current = LANGUAGES.find((item) => item.code === language) ?? LANGUAGES[0];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" dir="ltr">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
        }}
        className="inline-flex min-h-11 max-w-[11.5rem] items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="truncate">{current.nativeName}</span>
        <span aria-hidden="true" className="text-xs text-zinc-500">
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={current.nativeName}
          onKeyDown={(event) => {
            const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
            const current = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
              : event.key === "ArrowDown" ? (current + 1) % options.length
                : event.key === "ArrowUp" ? (current - 1 + options.length) % options.length : -1;
            if (next >= 0) { event.preventDefault(); options[next]?.focus(); }
            if (event.key === "Tab") setOpen(false);
          }}
          className="absolute top-full left-0 z-50 mt-2 max-h-80 w-72 overflow-y-auto overscroll-contain rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl shadow-black/10 dark:border-white/15 dark:bg-zinc-950 dark:shadow-black/50"
        >
          {LANGUAGES.map((item) => {
            const selected = item.code === language;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  setLanguage(item.code);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  selected
                    ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                    : "hover:bg-zinc-100 dark:hover:bg-white/10"
                }`}
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {item.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" dir="auto">
                    {item.nativeName}
                  </span>
                  <span
                    className={`block truncate text-xs ${selected ? "text-white/70 dark:text-zinc-600" : "text-zinc-500"}`}
                  >
                    {item.name}
                  </span>
                </span>
                {selected ? (
                  <span aria-hidden="true" className="text-sm font-bold">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
