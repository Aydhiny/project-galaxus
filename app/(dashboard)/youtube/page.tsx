import { getStudio } from "@/lib/actions/youtube";
import { YoutubeView } from "@/components/youtube/youtube-view";

export const metadata = { title: "YouTube" };
export const dynamic = "force-dynamic";
export const maxDuration = 300; // long-form scripts and rough cuts take a minute or two

export default async function YoutubePage() {
  return <YoutubeView state={await getStudio()} />;
}
