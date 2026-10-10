import { getRadar } from "@/lib/actions/gigs";
import { GigsView } from "@/components/gigs/gigs-view";

export const metadata = { title: "Gig radar" };
export const dynamic = "force-dynamic";

export default async function GigsPage() {
  return <GigsView state={await getRadar()} />;
}
