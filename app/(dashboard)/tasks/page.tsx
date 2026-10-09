import { listTasks } from "@/lib/actions/tasks";
import { listMonthlyGoals } from "@/lib/actions/monthly-goals";
import { monthKey, shiftMonth } from "@/lib/goals";
import { TasksView } from "@/components/tasks/tasks-view";
import { toDateKey } from "@/lib/tasks";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  // Neighbouring months too: the server runs in UTC, so near midnight on the
  // 1st the user's local month can differ from the server's.
  const m = monthKey(new Date());
  const [tasks, goals] = await Promise.all([listTasks(), listMonthlyGoals([shiftMonth(m, -1), m, shiftMonth(m, 1)])]);
  return <TasksView initialTasks={tasks} goals={goals} serverToday={toDateKey(new Date())} />;
}
