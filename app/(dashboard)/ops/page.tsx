import { getOps } from "@/lib/actions/ops";
import { OpsView } from "@/components/ops/ops-view";
import { OpsCelebrate } from "@/components/ops/ops-celebrate";

export const metadata = { title: "Ops" };
export const dynamic = "force-dynamic";
// Server actions here can start free-model missions, which finish in after() within this limit.
export const maxDuration = 300;

export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const data = await getOps();
  return (
    <>
      <OpsView data={data} openInbox={sp.inbox === "1"} />
      {/* Only the ids cross to the client (not a second copy of `data`). */}
      <OpsCelebrate
        doneMissions={data.missions.filter((m) => m.status === "done").map((m) => m.id)}
        doneProjects={data.projects.filter((p) => p.status === "done").map((p) => p.id)}
      />
    </>
  );
}
