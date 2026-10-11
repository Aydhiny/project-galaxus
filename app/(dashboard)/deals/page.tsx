import { getDeals } from "@/lib/actions/deals";
import { DealsView } from "@/components/deals/deals-view";

export const metadata = { title: "Deal desk" };
export const dynamic = "force-dynamic";

export default async function DealsPage() {
  return <DealsView deals={await getDeals()} />;
}
