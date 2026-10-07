import type { Metadata } from "next";
import { GameLobby } from "@/components/game-lobby";

export const metadata: Metadata = {
  title: "你瞎了嗎？",
  description: "看特寫，猜這張圖是什麼",
};

export default function LobbyPage() {
  return <GameLobby />;
}
