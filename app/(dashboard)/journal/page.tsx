import { redirect } from "next/navigation";

// The Journal merged into the Diary (gratitude has its own tab there).
export default function JournalPage() {
  redirect("/diary");
}
