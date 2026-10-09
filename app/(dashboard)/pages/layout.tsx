import { listPages } from "@/lib/actions/pages";
import { PagesShell } from "@/components/pages/pages-shell";

export const metadata = { title: "Pages" };

// The page tree lives in the layout so it stays mounted (and keeps its
// expand/collapse state) while you move between pages.
export default async function PagesLayout({ children }: { children: React.ReactNode }) {
  const pages = await listPages();
  return <PagesShell pages={pages}>{children}</PagesShell>;
}
