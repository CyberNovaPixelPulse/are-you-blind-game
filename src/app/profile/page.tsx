import type { Metadata } from "next";
import { MyQuestions } from "@/components/my-questions";

export const metadata: Metadata = {
  title: "我出的題目",
  description: "查看自己出的題目、上線狀態與曝光次數",
};

export default function ProfilePage() {
  return <MyQuestions />;
}
