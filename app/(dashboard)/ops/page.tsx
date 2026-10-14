import { getOps } from "@/lib/actions/ops";
import { OpsView } from "@/components/ops/ops-view";

export const metadata = { title: "Ops" };
export const dynamic = "force-dynamic";
// Server actions here can start free-model missions, which finish in after() within this limit.
export const maxDuration = 300;

export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <OpsView data={await getOps()} openInbox={sp.inbox === "1"} />;
}
