import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth-session";
import { projectResultsFor } from "@/lib/services/ops-results";
import { ProjectResultsView } from "@/components/ops/ops-results-project";

export const metadata = { title: "Project results · Ops" };
export const dynamic = "force-dynamic";
// Pause / Keep going are server actions that can plan the day on a free model (finishing in after()).
export const maxDuration = 300;

export default async function OpsProjectResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!/^\d{1,9}$/.test(id) || !Number.isInteger(projectId) || projectId <= 0) notFound();
  // Scoped to the signed-in user: someone else's project id is simply "not found".
  const data = await projectResultsFor(await requireUserId(), projectId);
  if (!data) notFound();
  return <ProjectResultsView data={data} />;
}
