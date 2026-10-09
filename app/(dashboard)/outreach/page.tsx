import { getOutreachState } from "@/lib/actions/outreach";
import { OutreachView } from "@/components/outreach/outreach-view";

export const metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  return <OutreachView state={await getOutreachState()} />;
}
