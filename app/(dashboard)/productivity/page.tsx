import { listTasks, listCompletionHistory } from "@/lib/actions/tasks";
import { ProductivityDashboard } from "@/components/productivity/productivity-dashboard";
import { toDateKey } from "@/lib/tasks";

export const metadata = { title: "Productivity" };

export default async function ProductivityPage() {
  const [tasks, history] = await Promise.all([listTasks(), listCompletionHistory()]);
  return <ProductivityDashboard initialTasks={tasks} history={history} serverToday={toDateKey(new Date())} />;
}
