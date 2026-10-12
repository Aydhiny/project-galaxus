import { getDiary } from "@/lib/actions/diary";
import { DiaryView } from "@/components/diary/diary-view";
import { DiaryLock } from "@/components/diary/diary-lock";

export const metadata = { title: "Diary" };
export const dynamic = "force-dynamic";

export default async function DiaryPage() {
  const d = await getDiary();
  if (!d.unlocked) return <DiaryLock hasPin={d.hasPin} />;
  return <DiaryView entries={d.entries} />;
}
