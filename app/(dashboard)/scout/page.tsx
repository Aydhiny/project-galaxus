import { getScout } from "@/lib/actions/scout";
import { ScoutView } from "@/components/scout/scout-view";

export const metadata = { title: "Scout" };
export const dynamic = "force-dynamic";

export default async function ScoutPage() {
  return <ScoutView data={await getScout()} />;
}
