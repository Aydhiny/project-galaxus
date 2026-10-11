import { auth } from "@/auth";
import { requireUserId } from "@/lib/auth-session";
import { hudFor } from "@/lib/services/hud";
import { LevelView } from "@/components/level/level-view";

export const metadata = { title: "Level" };
export const dynamic = "force-dynamic";

export default async function LevelPage() {
  const [hud, session] = await Promise.all([hudFor(await requireUserId()), auth()]);
  return <LevelView hud={hud} name={session?.user?.name ?? "Player"} image={session?.user?.image ?? null} />;
}
