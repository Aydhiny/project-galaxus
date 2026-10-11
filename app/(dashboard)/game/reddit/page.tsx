import { getRedditState } from "@/lib/actions/reddit";
import { RedditView } from "@/components/reddit/reddit-view";

export const metadata = { title: "Reddit · Game dev" };
export const dynamic = "force-dynamic";

export default async function RedditPage() {
  return <RedditView state={await getRedditState()} />;
}
