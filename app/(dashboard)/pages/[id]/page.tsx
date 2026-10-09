import { notFound } from "next/navigation";
import { getPage, listPages, type PageSummary } from "@/lib/actions/pages";
import { PageEditor } from "@/components/pages/page-editor";

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) notFound();

  const [page, all] = await Promise.all([getPage(pageId), listPages()]);
  if (!page) notFound();

  // Walk up parent links for the breadcrumb trail (guarding against cycles).
  const byId = new Map(all.map((p) => [p.id, p]));
  const breadcrumbs: PageSummary[] = [];
  const seen = new Set<number>([page.id]);
  for (let pid = page.parentId; pid && !seen.has(pid); ) {
    const parent = byId.get(pid);
    if (!parent) break;
    seen.add(pid);
    breadcrumbs.unshift(parent);
    pid = parent.parentId;
  }

  return (
    <PageEditor
      // key: remount the editor per page so local state never leaks between pages
      key={page.id}
      page={{ id: page.id, title: page.title, icon: page.icon, isFavorite: page.isFavorite, blocks: page.blocks }}
      breadcrumbs={breadcrumbs}
      subpages={all.filter((p) => p.parentId === page.id)}
    />
  );
}
