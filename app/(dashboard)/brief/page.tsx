import { getBrief } from "@/lib/actions/brief";
import { BriefView } from "@/components/brief/brief-view";

export const metadata = { title: "Daily brief" };
export const dynamic = "force-dynamic";

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  return <BriefView state={await getBrief(day)} />;
}
