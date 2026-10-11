import { getCommunities } from "@/lib/actions/community";
import { CommunityView } from "@/components/community/community-view";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  return <CommunityView items={await getCommunities()} />;
}
