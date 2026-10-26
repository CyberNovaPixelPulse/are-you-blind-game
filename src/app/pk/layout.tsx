import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/pk", "多人猜圖 PK", "與朋友一起玩線上猜圖遊戲：隨機 1v1 對戰，或建立 4 碼房號邀請朋友比拼眼力。");

export default function PkLayout({ children }: LayoutProps<"/pk">) {
  return children;
}
