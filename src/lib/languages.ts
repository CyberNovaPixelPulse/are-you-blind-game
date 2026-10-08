export const LANGUAGE_STORAGE_KEY = "guess-meme-language";

export const LANGUAGE_CODES = [
  "zh-TW",
  "zh-CN",
  "en",
  "es",
  "ja",
  "ko",
  "pt",
  "ru",
  "de",
  "fr",
  "ar",
  "hi",
  "bn",
  "id",
  "it",
  "th",
  "pl",
  "uk",
  "nl",
  "el",
  "cs",
  "sv",
  "ro",
  "hu",
  "he",
  "ms",
  "fa",
  "fil",
  "da",
  "fi",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export type LanguageInfo = {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  htmlLang: string;
  dir: "ltr" | "rtl";
};

const RTL = new Set<LanguageCode>(["ar", "he", "fa"]);

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文", flag: "🇹🇼", htmlLang: "zh-Hant", dir: "ltr" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文", flag: "🇨🇳", htmlLang: "zh-Hans", dir: "ltr" },
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸", htmlLang: "en", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", htmlLang: "es", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵", htmlLang: "ja", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷", htmlLang: "ko", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇧🇷", htmlLang: "pt", dir: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺", htmlLang: "ru", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪", htmlLang: "de", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", htmlLang: "fr", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", htmlLang: "ar", dir: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", htmlLang: "hi", dir: "ltr" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇧🇩", htmlLang: "bn", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩", htmlLang: "id", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹", htmlLang: "it", dir: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭", htmlLang: "th", dir: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱", htmlLang: "pl", dir: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦", htmlLang: "uk", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱", htmlLang: "nl", dir: "ltr" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "🇬🇷", htmlLang: "el", dir: "ltr" },
  { code: "cs", name: "Czech", nativeName: "Čeština", flag: "🇨🇿", htmlLang: "cs", dir: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪", htmlLang: "sv", dir: "ltr" },
  { code: "ro", name: "Romanian", nativeName: "Română", flag: "🇷🇴", htmlLang: "ro", dir: "ltr" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", flag: "🇭🇺", htmlLang: "hu", dir: "ltr" },
  { code: "he", name: "Hebrew", nativeName: "עברית", flag: "🇮🇱", htmlLang: "he", dir: "rtl" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "🇲🇾", htmlLang: "ms", dir: "ltr" },
  { code: "fa", name: "Persian", nativeName: "فارسی", flag: "🇮🇷", htmlLang: "fa", dir: "rtl" },
  { code: "fil", name: "Filipino", nativeName: "Filipino", flag: "🇵🇭", htmlLang: "fil", dir: "ltr" },
  { code: "da", name: "Danish", nativeName: "Dansk", flag: "🇩🇰", htmlLang: "da", dir: "ltr" },
  { code: "fi", name: "Finnish", nativeName: "Suomi", flag: "🇫🇮", htmlLang: "fi", dir: "ltr" },
] as const;

export const SUPPORTED_LANGUAGES = LANGUAGES;

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function isLanguageCode(value: string): value is LanguageCode {
  return BY_CODE.has(value as LanguageCode);
}

export function languageByCode(code: LanguageCode): LanguageInfo {
  return BY_CODE.get(code) ?? LANGUAGES[2];
}

export function isRtlLanguage(code: LanguageCode): boolean {
  return RTL.has(code);
}

export function matchNavigatorLanguage(input: string | null | undefined): LanguageCode {
  const raw = input?.trim().replace(/_/g, "-") ?? "";
  if (!raw) return "zh-TW";

  const exact = LANGUAGES.find((language) => language.code.toLowerCase() === raw.toLowerCase());
  if (exact) return exact.code;

  const lower = raw.toLowerCase();
  if (lower.startsWith("zh")) {
    if (lower.includes("tw") || lower.includes("hk") || lower.includes("mo") || lower.includes("hant")) {
      return "zh-TW";
    }
    if (lower.includes("cn") || lower.includes("sg") || lower.includes("hans")) return "zh-CN";
    return "zh-TW";
  }
  if (lower === "tl" || lower.startsWith("fil") || lower.startsWith("tl-")) return "fil";

  const primary = lower.split("-")[0] ?? "";
  const byPrimary = LANGUAGES.find((language) => language.code.toLowerCase() === primary);
  if (byPrimary) return byPrimary.code;
  return "en";
}

export function resolveLanguage(stored: string | null, navigatorLanguage: string | null | undefined): LanguageCode {
  if (stored && isLanguageCode(stored)) return stored;
  return matchNavigatorLanguage(navigatorLanguage);
}

export type VipCheckoutCopy = {
  planAPrice: string;
  planADesc: string;
  planBPrice: string;
  planBDesc: string;
  deliveryNote: string;
  payNoticeEcpay: string;
  payNoticeRefund: string;
  payNoticeSupport: string;
  supportEmail: string;
};

export const VIP_CHECKOUT_COPY: Record<"zh-TW" | "en", VipCheckoutCopy> = {
  "zh-TW": {
    planAPrice: "新台幣 NT$ 19 / 月",
    planADesc: "自建好友房、全站免廣告",
    planBPrice: "新台幣 NT$ 39 終身買斷",
    planBDesc: "自建好友房、全站免廣告，一次付清永久使用",
    deliveryNote: "付款成功後系統立即開通權益",
    payNoticeEcpay: "• 本服務由綠界科技 ECPay 提供安全加密付款支援",
    payNoticeRefund:
      "• 購買須知：本方案屬非以有形媒介提供之數位服務，完成付款開通後，依消保法第十九條第二項規定，不適用七天鑑賞期無條件退換貨。",
    payNoticeSupport: "• 如遇付款或權限開通問題，請聯繫客服信箱：support@areyoublind.game（或站長信箱）",
    supportEmail: "support@areyoublind.game",
  },
  en: {
    planAPrice: "New Taiwan Dollar NT$ 19 / month",
    planADesc: "Private friend rooms and an ad-free experience",
    planBPrice: "New Taiwan Dollar NT$ 39 lifetime",
    planBDesc: "Private friend rooms and an ad-free experience, paid once for lifetime access",
    deliveryNote: "Access is activated immediately after successful payment.",
    payNoticeEcpay: "• Payments are securely encrypted by ECPay (Green World FinTech).",
    payNoticeRefund:
      "• Purchase notice: This plan is a digital service not supplied on a tangible medium. After payment and activation, the seven-day cooling-off period for unconditional returns does not apply, under Article 19, Paragraph 2 of the Consumer Protection Act.",
    payNoticeSupport:
      "• For payment or access issues, contact support@areyoublind.game (or the site owner).",
    supportEmail: "support@areyoublind.game",
  },
};
