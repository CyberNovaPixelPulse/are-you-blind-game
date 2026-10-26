import type { Metadata } from "next";

export const siteName = "你瞎了嗎？";
export const siteDescription = "你瞎了嗎？（AreYouBlind）是線上猜圖遊戲：看圖片局部特寫猜物件，玩休閒猜謎、10 秒限時挑戰、每日十題，或與朋友多人 PK，也能上傳圖片自己出題。";

// Use the game's dedicated subdomain by default; deployments may override it explicitly.
const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://guess.necterelux.com";

export const siteUrl = configuredUrl ? new URL(configuredUrl) : undefined;
if (siteUrl && (!['http:', 'https:'].includes(siteUrl.protocol)
  || siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash)) {
  throw new Error("NEXT_PUBLIC_SITE_URL 必須是網站根網址，例如 https://example.com");
}

export function pageMetadata(path: string, title: string, description: string): Metadata {
  const url = siteUrl ? new URL(path, siteUrl).toString() : undefined;
  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { title, description, siteName, locale: "zh_TW", type: "website", ...(url ? { url } : {}) },
    twitter: { card: "summary", title, description },
  };
}
