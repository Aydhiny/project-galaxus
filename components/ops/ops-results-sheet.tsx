"use client";

// The project's merged sheet as a fast table: search, filter chips, sortable
// columns, 100 rows a page (a 1,000-row sheet stays instant without a
// virtualization library), and an Excel export of exactly what's shown.
// Cells are agent-written text: links only for http(s), mailto only for a
// plain address, WhatsApp only through whatsappLink.

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, ExternalLink, Mail, MessageCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { xlsxFromRows } from "@/lib/xlsx";
import {
  exportRows, facets, filterRows, mailtoHref, safeHref, sheetModel, sortRows, waHref,
  type SheetCols, type SheetFilter, type SheetRow, type SheetSort,
} from "@/lib/ops-results";
import { field } from "@/components/ops/ops-dialog";

export const PAGE_SIZE = 100;

const FLAGS = [
  ["whatsapp", "Has WhatsApp"], ["email", "Has email"], ["noWebsite", "No website"], ["facebookOnly", "Facebook only"], ["badWebsite", "Bad website"],
] as const;
type Flag = (typeof FLAGS)[number][0];

const chipCls = (on: boolean) => cn("h-7 px-2.5 rounded-full border text-xs inline-flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]",
  on ? "bg-[#6b8afd]/20 border-[#6b8afd]/60 text-[#c7d2ff]" : "border-white/10 text-white/65 hover:text-white hover:bg-white/[0.06]");
const linkCls = "text-[#8ea6ff] underline decoration-[#8ea6ff]/40 underline-offset-2 hover:decoration-[#8ea6ff] break-all";

const fileName = (s: string) => `${s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w -]+/g, "").trim().slice(0, 60) || "galaxus"}.xlsx`;

export function ResultsSheet({ sheet, title }: { sheet: string[][]; title: string }) {
  const model = useMemo(() => sheetModel(sheet), [sheet]);
  const [filter, setFilter] = useState<SheetFilter>({});
  const [sort, setSort] = useState<SheetSort>(null);
  const [page, setPage] = useState(0);
  // Every change of what's shown goes back to page 1 (done here, not in an effect).
  const update = (f: Partial<SheetFilter>) => { setFilter((x) => ({ ...x, ...f })); setPage(0); };

  const shown = useMemo(() => sortRows(filterRows(model.rows, filter), sort), [model.rows, filter, sort]);
  const cities = useMemo(() => facets(model.rows, "city", 10), [model.rows]);
  const categories = useMemo(() => facets(model.rows, "category", 10), [model.rows]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const visible = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const filtering = !!(filter.q || filter.city || filter.category || FLAGS.some(([k]) => filter[k]));

  const sortBy = (col: number) => { setSort((s) => (!s || s.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : null)); setPage(0); };
  const download = () => {
    // Built in the browser from the rows on screen: the same xlsx writer the server uses, no round trip, nothing uploaded.
    const bytes = xlsxFromRows(exportRows(model.header, shown), title);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = fileName(filtering ? `${title} (filtered)` : title);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!model.rows.length) return <p className="text-sm text-white/55">No table rows yet: the sheet fills as the crew delivers.</p>;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" aria-hidden />
          <input type="search" value={filter.q ?? ""} onChange={(e) => update({ q: e.target.value })} placeholder="Search name, address, category…" aria-label="Search the sheet" className={cn(field, "pl-8")} />
        </label>
        <button type="button" onClick={download} disabled={!shown.length}
          className="h-9 px-3 rounded-lg border border-emerald-300/40 text-sm text-emerald-100 hover:bg-emerald-400/10 inline-flex items-center gap-1.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]">
          <Download className="w-4 h-4" /> {filtering ? `Export ${shown.length} shown` : "Export to Excel"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filters">
        {FLAGS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={!!filter[k]} onClick={() => update({ [k]: !filter[k] } as Partial<Record<Flag, boolean>>)} className={chipCls(!!filter[k])}>{label}</button>
        ))}
        {filtering && (
          <button type="button" onClick={() => { setFilter({}); setPage(0); }} className="h-7 px-2.5 rounded-full text-xs text-rose-200 hover:bg-rose-400/10 inline-flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>
        )}
      </div>
      {cities.length > 1 && <FacetChips label="City" items={cities} value={filter.city} onPick={(city) => update({ city })} />}
      {categories.length > 1 && <FacetChips label="Category" items={categories} value={filter.category} onPick={(category) => update({ category })} />}

      <p className="text-[11px] text-white/50" aria-live="polite">
        {shown.length === model.rows.length ? `${model.rows.length} rows` : `${shown.length} of ${model.rows.length} rows`}
        {shown.length > PAGE_SIZE && ` · showing ${at * PAGE_SIZE + 1}–${Math.min(shown.length, (at + 1) * PAGE_SIZE)}`}
      </p>

      {/* The table scrolls inside its own box (both ways), so the page never scrolls sideways on a phone. */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-[#26272b]" tabIndex={0} role="region" aria-label="Sheet rows">
        <table className="w-full min-w-[56rem] text-[12px]">
          <thead>
            <tr>
              {model.header.map((h, k) => {
                const dir = sort?.col === k ? sort.dir : null;
                return (
                  <th key={k} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
                    className="sticky top-0 z-10 bg-[#303136] px-2 py-1.5 text-left font-semibold text-white whitespace-nowrap border-b border-white/10">
                    <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 rounded hover:text-[#c7d2ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]">
                      {h}{dir === "asc" ? <ArrowUp className="w-3 h-3" /> : dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                {model.header.map((_, k) => <td key={k} className="px-2 py-1.5 align-top text-white/80 max-w-[18rem]"><Cell r={r} k={k} cols={model.cols} /></td>)}
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={model.header.length} className="px-3 py-6 text-center text-white/50">Nothing matches. Try fewer filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-end gap-2 text-xs text-white/70" aria-label="Pages">
          <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} className="h-8 px-2.5 rounded-lg border border-white/15 inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
          <span className="tabular-nums">Page {at + 1} of {pages}</span>
          <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} className="h-8 px-2.5 rounded-lg border border-white/15 inline-flex items-center gap-1 disabled:opacity-40">Next <ChevronRight className="w-3.5 h-3.5" /></button>
        </nav>
      )}
    </div>
  );
}

function FacetChips({ label, items, value, onPick }: { label: string; items: { value: string; count: number }[]; value?: string; onPick: (v: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="text-[11px] text-white/45 mr-0.5">{label}</span>
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onPick(value === it.value ? undefined : it.value)} className={chipCls(value === it.value)}>
          {it.value} <span className="text-white/40 tabular-nums">{it.count}</span>
        </button>
      ))}
    </div>
  );
}

/** One cell: links where the column is a link (and only safe ones), plain text everywhere else. */
function Cell({ r, k, cols }: { r: SheetRow; k: number; cols: SheetCols }) {
  const v = (r.cells[k] ?? "").trim();
  if (!v) return <span className="text-white/25">–</span>;
  if (k === cols.source || k === cols.website) {
    const href = safeHref(v);
    if (href) {
      const label = k === cols.source ? (/openstreetmap/.test(href) ? "Map" : /google\./.test(href) ? "Google Maps" : new URL(href).hostname.replace(/^www\./, "")) : new URL(href).hostname.replace(/^www\./, "");
      return <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cn(linkCls, "inline-flex items-center gap-0.5")}>{label}<ExternalLink className="w-3 h-3 shrink-0" /></a>;
    }
  }
  if (k === cols.email) {
    const href = mailtoHref(v);
    if (href) return <a href={href} className={cn(linkCls, "inline-flex items-center gap-1")}><Mail className="w-3 h-3 shrink-0" />{r.email}</a>;
  }
  // The chat link sits in the WhatsApp column (or in Phone when the sheet has none), once per row.
  if (k === (cols.wa >= 0 ? cols.wa : cols.phone)) {
    const wa = waHref(r);
    if (wa) return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="whitespace-nowrap">{v}</span>
        <a href={wa} target="_blank" rel="noopener noreferrer nofollow" aria-label={`WhatsApp ${r.name}`} title="Open a WhatsApp chat (nothing is sent)"
          className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300/40 px-1.5 text-[11px] text-emerald-200 hover:bg-emerald-400/10"><MessageCircle className="w-3 h-3" /> Chat</a>
      </span>
    );
  }
  return <span className="break-words">{v}</span>;
}
