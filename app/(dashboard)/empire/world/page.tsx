import { getEmpireWorld } from "@/lib/actions/empire";
import { WorldView } from "@/components/empire/world-view";

export const metadata = { title: "World" };
export const dynamic = "force-dynamic";

export default async function WorldPage() {
  const { cities, sharing } = await getEmpireWorld();
  return <WorldView cities={cities} sharing={sharing} />;
}
