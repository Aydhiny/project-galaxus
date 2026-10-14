"use client";

// Agent results, rendered: headings, lists, to-dos, quotes, code, tables, and
// inline **bold**, *italic*, `code` and links. Agent text is untrusted, so this
// never uses HTML — every piece becomes a React text node, and only http(s)
// links are clickable (opened in a new tab, no referrer).

import { Fragment, useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { mdInline, mdToBlocks } from "@/lib/ops";

function Inline({ text }: { text: string }) {
  return (
    <>
      {mdInline(text).map((s, i) =>
        s.t === "b" ? <strong key={i} className="font-semibold text-white"><Inline text={s.v} /></strong>
        : s.t === "i" ? <em key={i} className="italic">{s.v}</em>
        : s.t === "code" ? <code key={i} className="rounded bg-white/10 px-1 py-px font-mono text-[0.85em] text-[#c7d2ff]">{s.v}</code>
        : s.t === "link" ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="text-[#8ea6ff] underline decoration-[#8ea6ff]/40 underline-offset-2 hover:decoration-[#8ea6ff] break-words">{s.v.length > 70 ? `${s.v.slice(0, 67)}…` : s.v}</a>
        : <Fragment key={i}>{s.v}</Fragment>,
      )}
    </>
  );
}

export function Markdown({ md, className }: { md: string; className?: string }) {
  const blocks = useMemo(() => mdToBlocks(md, { inline: true }), [md]);
  return (
    <div className={cn("space-y-1.5 text-[13px] leading-relaxed text-white/85 break-words", className)}>
      {blocks.map((b, i) => {
        const pad = { paddingLeft: `${(b.indent ?? 0) * 14}px` };
        switch (b.type) {
          case "h1": return <h3 key={i} className="pt-1 text-[15px] font-bold text-white"><Inline text={b.text} /></h3>;
          case "h2": return <h4 key={i} className="pt-1.5 text-[14px] font-semibold text-white"><Inline text={b.text} /></h4>;
          case "h3": return <h5 key={i} className="pt-1 text-[13px] font-semibold text-[#c7d2ff]"><Inline text={b.text} /></h5>;
          case "bullet": return <div key={i} className="flex gap-2" style={pad}><span className="mt-[0.55em] w-1.5 h-1.5 shrink-0 rounded-full bg-[#6b8afd]/80" /><span className="min-w-0"><Inline text={b.text} /></span></div>;
          case "numbered": return <div key={i} className="flex gap-2" style={pad}><span className="shrink-0 min-w-[1.1rem] font-mono text-[12px] text-[#8ea6ff]">{b.n ?? 1}.</span><span className="min-w-0"><Inline text={b.text} /></span></div>;
          case "todo": return (
            <div key={i} className="flex gap-2" style={pad}>
              <span className={cn("mt-[0.2em] w-3.5 h-3.5 shrink-0 rounded border inline-flex items-center justify-center", b.checked ? "bg-emerald-400/80 border-emerald-400" : "border-white/30")}>{b.checked && <Check className="w-2.5 h-2.5 text-black" />}</span>
              <span className={cn("min-w-0", b.checked && "line-through text-white/50")}><Inline text={b.text} /></span>
            </div>
          );
          case "quote": return <blockquote key={i} className="border-l-2 border-[#6b8afd]/60 pl-2.5 text-white/70 italic"><Inline text={b.text} /></blockquote>;
          case "code": return <pre key={i} className="overflow-x-auto rounded-lg bg-black/40 border border-white/10 p-2 font-mono text-[12px] text-white/85 whitespace-pre">{b.text}</pre>;
          case "divider": return <hr key={i} className="my-2 border-white/10" />;
          case "table": return (
            <div key={i} className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-[12px]">
                <tbody>
                  {(b.rows ?? []).map((row, r) => (
                    <tr key={r} className={cn(r === 0 ? "bg-white/[0.06] font-semibold text-white" : "border-t border-white/10")}>
                      {row.map((c, k) => <td key={k} className="px-2 py-1 align-top"><Inline text={c} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          default: return <p key={i}><Inline text={b.text} /></p>;
        }
      })}
    </div>
  );
}
