import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "挑戰模式",
  description: "10 秒一題，答錯或超時就結束",
};

export default function ChallengeLayout({ children }: LayoutProps<"/challenge">) {
  return children;
}
