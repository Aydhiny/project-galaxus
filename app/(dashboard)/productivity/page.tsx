import { listTasks } from "@/lib/actions/tasks";
import { ProductivityDashboard } from "@/components/productivity/productivity-dashboard";
import { toDateKey } from "@/lib/tasks";

export const metadata = { title: "Productivity" };

export default async function ProductivityPage() {
  const tasks = await listTasks();
  return <ProductivityDashboard initialTasks={tasks} serverToday={toDateKey(new Date())} />;
}
