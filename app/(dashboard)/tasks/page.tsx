import { listTasks } from "@/lib/actions/tasks";
import { TasksView } from "@/components/tasks/tasks-view";
import { toDateKey } from "@/lib/tasks";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const tasks = await listTasks();
  return <TasksView initialTasks={tasks} serverToday={toDateKey(new Date())} />;
}
