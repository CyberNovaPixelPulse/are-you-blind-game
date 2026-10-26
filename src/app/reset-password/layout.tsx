import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "重設密碼",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
