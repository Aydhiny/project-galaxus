import { getOps } from "@/lib/actions/ops";
import { OpsView } from "@/components/ops/ops-view";

export const metadata = { title: "Ops" };
export const dynamic = "force-dynamic";

export default async function OpsPage() {
  return <OpsView data={await getOps()} />;
}
