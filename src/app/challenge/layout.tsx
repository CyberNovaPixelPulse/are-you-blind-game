import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/challenge", "限時猜圖挑戰", "看局部特寫猜物件，每題限時 10 秒；也能參加每日十題，與全站玩家比較分數。");

export default function ChallengeLayout({ children }: LayoutProps<"/challenge">) {
  return children;
}
