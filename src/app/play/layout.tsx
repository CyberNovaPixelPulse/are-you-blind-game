import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/play", "休閒猜圖", "看圖片局部特寫猜出物件，隨時開始線上猜圖遊戲，挑戰你的觀察力與聯想力。");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
