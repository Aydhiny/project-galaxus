import { getRadar } from "@/lib/actions/gigs";
import { getAutopilot } from "@/lib/actions/autopilot";
import { GigsView } from "@/components/gigs/gigs-view";

export const metadata = { title: "Gig radar" };
export const dynamic = "force-dynamic";

export default async function GigsPage() {
  const [state, autopilot] = await Promise.all([getRadar(), getAutopilot()]);
  return <GigsView state={state} autopilot={autopilot} />;
}
