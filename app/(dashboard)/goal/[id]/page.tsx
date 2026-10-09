import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth-session";
import { getGoalFor, listGoalsFor } from "@/lib/services/goals";
import { listTasksFor } from "@/lib/services/tasks";
import { GoalPage } from "@/components/goals/goal-page";
import { toDateKey } from "@/lib/tasks";

export default async function GoalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goalId = Number(id);
  if (!Number.isInteger(goalId) || goalId <= 0) notFound();

  const userId = await requireUserId();
  const [goal, tasks, goals] = await Promise.all([
    getGoalFor(userId, goalId),
    listTasksFor(userId, { goalId }),
    listGoalsFor(userId),
  ]);
  if (!goal) notFound();

  return <GoalPage key={goal.id} goal={goal} initialTasks={tasks} goals={goals} serverToday={toDateKey(new Date())} />;
}
