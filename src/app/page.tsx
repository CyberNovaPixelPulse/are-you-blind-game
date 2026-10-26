import { GameLobby } from "@/components/game-lobby";
import { pageMetadata, siteDescription } from "@/lib/seo";

export const metadata = pageMetadata("/", "你瞎了嗎？｜線上猜圖、每日挑戰與多人 PK", siteDescription);

export default function LobbyPage() {
  return <GameLobby />;
}
