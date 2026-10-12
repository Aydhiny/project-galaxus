import { redirect } from "next/navigation";

// Daily Goals were replaced by Tasks (with due dates, goals and routines).
export default function GoalsPage() {
  redirect("/tasks");
}
