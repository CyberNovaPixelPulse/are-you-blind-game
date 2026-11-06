import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import { SkipToContent } from "@/components/skip-to-content";
import { LanguageProvider } from "@/components/language-provider";
import { siteDescription, siteName, siteUrl } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gameSans = Noto_Sans_TC({ variable: "--font-game-sans", subsets: ["latin"], display: "swap", preload: false });

const c2Display = Anton({ variable: "--font-c2-display", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: `${siteName}｜線上猜圖遊戲`, template: `%s｜${siteName}` },
  description: siteDescription,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffe14d" },
    { media: "(prefers-color-scheme: dark)", color: "#ffe14d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant"
      className={`${gameSans.variable} ${c2Display.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5637115871659505"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider><SkipToContent />{children}</LanguageProvider>
      </body>
    </html>
  );
}
