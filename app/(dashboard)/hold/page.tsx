import { getHoldState } from "@/lib/actions/wellbeing";
import { HoldView } from "@/components/hold/hold-view";

export const metadata = { title: "Hold the line" };
export const dynamic = "force-dynamic";

export default async function HoldPage() {
  return <HoldView state={await getHoldState()} />;
}
