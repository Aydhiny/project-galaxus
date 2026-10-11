import { getConnections } from "@/lib/actions/connections";
import { getRedditConnection } from "@/lib/actions/reddit";
import { ConnectionsView } from "@/components/connections/connections-view";

export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const [connections, reddit] = await Promise.all([getConnections(), getRedditConnection()]);
  return <ConnectionsView connections={connections} reddit={reddit} />;
}
