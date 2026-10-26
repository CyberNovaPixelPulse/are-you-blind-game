import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "猜圖 PK 房間",
  robots: { index: false, follow: true },
};

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
