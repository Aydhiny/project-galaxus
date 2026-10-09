import { listTasks, listCompletionHistory } from "@/lib/actions/tasks";
import { listMonthlyGoals } from "@/lib/actions/monthly-goals";
import { monthKey, shiftMonth } from "@/lib/goals";
import { ProductivityDashboard } from "@/components/productivity/productivity-dashboard";
import { toDateKey } from "@/lib/tasks";

export const metadata = { title: "Productivity" };

export default async function ProductivityPage() {
  const m = monthKey(new Date());
  const [tasks, history, goals] = await Promise.all([
    listTasks(),
    listCompletionHistory(),
    listMonthlyGoals([shiftMonth(m, -1), m, shiftMonth(m, 1)]),
  ]);
  return <ProductivityDashboard initialTasks={tasks} history={history} goals={goals} serverToday={toDateKey(new Date())} />;
}
