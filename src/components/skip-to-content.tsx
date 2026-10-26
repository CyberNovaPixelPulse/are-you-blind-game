"use client";

import { useLanguage } from "@/components/language-provider";

export function SkipToContent() {
  const { language } = useLanguage();
  const labels: Record<string, string> = { "zh-TW": "跳至主要內容", "zh-CN": "跳至主要内容", en: "Skip to main content", ar: "انتقل إلى المحتوى الرئيسي" };
  return <a href="#main-content" lang={labels[language] ? language : "en"}
    className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[200] rounded-xl bg-foreground px-4 py-3 font-semibold text-background">
    {labels[language] ?? labels.en}
  </a>;
}
