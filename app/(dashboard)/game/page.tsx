import { getGameState } from "@/lib/actions/game";
import { GameView } from "@/components/game/game-view";

export const metadata = { title: "Game dev" };
export const dynamic = "force-dynamic";

export default async function GamePage() {
  return <GameView state={await getGameState()} />;
}
