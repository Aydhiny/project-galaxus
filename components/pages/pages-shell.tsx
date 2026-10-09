"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronRight, FileText, Plus, Star, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPage, type PageSummary } from "@/lib/actions/pages";

export function PagesShell({ pages, children }: { pages: PageSummary[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeId = Number(pathname.split("/")[2]) || null;
  const [treeOpen, setTreeOpen] = useState(true);

  return (
    <div className="flex h-full min-h-0">
      {treeOpen && (
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar/40">
          <PageTree pages={pages} activeId={activeId} onCollapse={() => setTreeOpen(false)} />
        </aside>
      )}
      <div className="flex-1 min-w-0 overflow-y-auto relative">
        {!treeOpen && (
          <button
            onClick={() => setTreeOpen(true)}
            className="hidden lg:flex absolute left-3 top-3 z-10 w-7 h-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Show page list"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function PageTree({ pages, activeId, onCollapse }: { pages: PageSummary[]; activeId: number | null; onCollapse: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const childrenOf = useMemo(() => {
    const map = new Map<number | null, PageSummary[]>();
    for (const p of pages) {
      const list = map.get(p.parentId) ?? [];
      list.push(p);
      map.set(p.parentId, list);
    }
    return map;
  }, [pages]);

  const favorites = pages.filter((p) => p.isFavorite);

  function newPage(parentId?: number) {
    startTransition(async () => {
      const id = await createPage(parentId ?? null);
      router.push(`/pages/${id}`);
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 shrink-0">
        <Link href="/pages" className="text-sm font-semibold hover:opacity-80">Pages</Link>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => newPage()}
            disabled={pending}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
            aria-label="New page"
            title="New page"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onCollapse}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Hide page list"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        {favorites.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Favorites</p>
            {favorites.map((p) => (
              <TreeRow key={`fav-${p.id}`} page={p} depth={0} activeId={activeId} childrenOf={childrenOf} onAddChild={newPage} flat />
            ))}
          </div>
        )}
        <div>
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Private</p>
          {(childrenOf.get(null) ?? []).map((p) => (
            <TreeRow key={p.id} page={p} depth={0} activeId={activeId} childrenOf={childrenOf} onAddChild={newPage} />
          ))}
          <button
            onClick={() => newPage()}
            disabled={pending}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="w-4 h-4" /> New page
          </button>
        </div>
      </div>
    </div>
  );
}

function TreeRow({ page, depth, activeId, childrenOf, onAddChild, flat }: {
  page: PageSummary;
  depth: number;
  activeId: number | null;
  childrenOf: Map<number | null, PageSummary[]>;
  onAddChild: (parentId: number) => void;
  flat?: boolean;
}) {
  const kids = flat ? [] : childrenOf.get(page.id) ?? [];
  const containsActive = useMemo(() => {
    const walk = (id: number): boolean => (childrenOf.get(id) ?? []).some((c) => c.id === activeId || walk(c.id));
    return walk(page.id);
  }, [childrenOf, page.id, activeId]);
  const [open, setOpen] = useState(containsActive);
  const expanded = open || containsActive;
  const active = page.id === activeId;

  return (
    <div>
      <div
        className={cn(
          "group/row flex items-center gap-1 rounded-md pr-1 h-[30px] text-sm",
          active ? "bg-accent text-foreground font-medium" : "text-foreground/75 hover:bg-accent/70"
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          onClick={() => setOpen(!expanded)}
          className={cn(
            "w-5 h-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-foreground/[0.08]",
            kids.length === 0 && "invisible"
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <Link href={`/pages/${page.id}`} className="flex-1 min-w-0 flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-[15px] leading-none">
            {page.icon ?? <FileText className="w-4 h-4 inline text-muted-foreground" />}
          </span>
          <span className="truncate">{page.title || "Untitled"}</span>
        </Link>
        {page.isFavorite && flat && <Star className="w-3 h-3 shrink-0 fill-current text-amber-500" />}
        {!flat && (
          <button
            onClick={() => { setOpen(true); onAddChild(page.id); }}
            className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-foreground/[0.08]"
            aria-label="Add sub-page"
            title="Add sub-page"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {expanded && kids.map((k) => (
        <TreeRow key={k.id} page={k} depth={depth + 1} activeId={activeId} childrenOf={childrenOf} onAddChild={onAddChild} />
      ))}
    </div>
  );
}
