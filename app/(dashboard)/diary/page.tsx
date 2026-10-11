import { getDiary } from "@/lib/actions/diary";
import { DiaryView } from "@/components/diary/diary-view";

export const metadata = { title: "Diary" };
export const dynamic = "force-dynamic";

export default async function DiaryPage() {
  return <DiaryView entries={await getDiary()} />;
}
