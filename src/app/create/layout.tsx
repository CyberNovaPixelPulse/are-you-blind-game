import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/create", "上傳圖片出題", "上傳圖片、選取局部特寫並設定答案，製作自己的猜圖題目，讓其他玩家挑戰。");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
