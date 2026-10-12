import { redirect } from "next/navigation";

// The Daily Check-in was retired: prayers are logged on Spiritual, training,
// reading, focus and sleep are logged where they happen.
export default function DailyPage() {
  redirect("/spiritual");
}
