import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText, Star } from "lucide-react";
import { listPages } from "@/lib/actions/pages";
import { NewPageButton } from "@/components/pages/new-page-button";

export default async function PagesIndex() {
  const pages = await listPages();
  const favorites = pages.filter((p) => p.isFavorite);
  const recent = [...pages]
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, 24);

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <div className="flex items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notes, plans and checklists. Type <kbd className="px-1.5 py-0.5 rounded border border-border text-xs font-mono">/</kbd> inside a page for blocks.
          </p>
        </div>
        <NewPageButton />
      </div>

      {pages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 px-6 text-center">
          <p className="text-4xl mb-3">📝</p>
          <p className="font-medium">No pages yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Start with a weekly plan, a project brief, or a brain dump.</p>
          <NewPageButton />
        </div>
      ) : (
        <div className="space-y-10">
          {favorites.length > 0 && (
            <section>
              <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
                <Star className="w-3.5 h-3.5" /> Favorites
              </h2>
              <PageGrid pages={favorites} />
            </section>
          )}
          <section>
            <h2 className="text-xs font-medium text-muted-foreground mb-3">Recently edited</h2>
            <PageGrid pages={recent} />
          </section>
        </div>
      )}
    </div>
  );
}

function PageGrid({ pages }: { pages: Awaited<ReturnType<typeof listPages>> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {pages.map((p) => (
        <Link
          key={p.id}
          href={`/pages/${p.id}`}
          className="group rounded-xl border border-border bg-card p-4 h-32 flex flex-col justify-between hover:bg-accent/50 transition-colors"
        >
          <span className="text-2xl leading-none">
            {p.icon ?? <FileText className="w-6 h-6 text-muted-foreground" />}
          </span>
          <span>
            <span className="block text-sm font-medium truncate">{p.title || "Untitled"}</span>
            {p.updatedAt && (
              <span className="block text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(p.updatedAt, { addSuffix: true })}
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}
