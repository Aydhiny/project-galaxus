import { getConnections } from "@/lib/actions/connections";
import { ConnectionsView } from "@/components/connections/connections-view";

export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  return <ConnectionsView connections={await getConnections()} />;
}
