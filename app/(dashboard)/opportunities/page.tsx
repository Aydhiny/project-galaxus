import { getOpportunities } from "@/lib/actions/opportunities";
import { OpportunitiesView } from "@/components/opportunities/opportunities-view";

export const metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  return <OpportunitiesView items={await getOpportunities()} />;
}
