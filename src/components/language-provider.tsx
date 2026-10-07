"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  LANGUAGE_STORAGE_KEY,
  languageByCode,
  resolveLanguage,
  type LanguageCode,
} from "@/lib/languages";
import { createCopyFor, type CreateQuizCopy } from "@/lib/create-copy";
import { translate, type UiKey } from "@/lib/ui-copy";
import { sectionsFor, type UiSections } from "@/lib/ui-sections";
import { vipCopyFor, type VipModalCopy } from "@/lib/vip-copy";

const LANGUAGE_EVENT = "guess-meme-language";

export type Translator = ((key: UiKey, vars?: Record<string, string | number>) => string) &
  UiSections & { createQuiz: CreateQuizCopy; vipModal: VipModalCopy };

type LanguageContextValue = {
  language: LanguageCode;
  ready: boolean;
  setLanguage: (code: LanguageCode) => void;
  t: Translator;
};

function createTranslator(language: LanguageCode): Translator {
  return Object.assign(
    (key: UiKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    sectionsFor(language),
    { createQuiz: createCopyFor(language), vipModal: vipCopyFor(language) },
  );
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): LanguageCode {
  return resolveLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY), window.navigator.language);
}

function subscribeLanguage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LANGUAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LANGUAGE_EVENT, onStoreChange);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore<LanguageCode>(
    subscribeLanguage,
    readStoredLanguage,
    () => "zh-TW",
  );

  useEffect(() => {
    const entry = languageByCode(language);
    document.documentElement.lang = entry.htmlLang;
    document.documentElement.dir = entry.dir;
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);

  const t = useMemo(() => createTranslator(language), [language]);

  const value = useMemo(
    () => ({ language, ready: true, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage 必須包在 LanguageProvider 裡");
  return value;
}
