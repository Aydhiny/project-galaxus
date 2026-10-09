import { getStudio } from "@/lib/actions/youtube";
import { YoutubeView } from "@/components/youtube/youtube-view";

export const metadata = { title: "YouTube" };
export const dynamic = "force-dynamic";

export default async function YoutubePage() {
  return <YoutubeView state={await getStudio()} />;
}
