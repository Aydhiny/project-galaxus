import { requireUserId } from "@/lib/auth-session";
import { resultsIndexFor } from "@/lib/services/ops-results";
import { ResultsIndex } from "@/components/ops/ops-results-index";

export const metadata = { title: "Project results · Ops" };
export const dynamic = "force-dynamic";

export default async function OpsResultsPage() {
  const { projects, now } = await resultsIndexFor(await requireUserId());
  return <ResultsIndex projects={projects} now={now} />;
}
