import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "多人 PK",
  description: "隨機 1v1，或開 4 碼房號跟朋友一起猜",
};

export default function PkLayout({ children }: LayoutProps<"/pk">) {
  return children;
}
