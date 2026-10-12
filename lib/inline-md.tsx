// Notion-style inline formatting on top of plain text, rendered safely as
// React elements (no HTML injection): **bold**, *italic* / _italic_,
// ~~strike~~, `code`, [label](https://…) and bare https:// links.

import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\)|(?<![\w*])\*[^*\n]+\*(?!\w)|(?<![\w_])_[^_\n]+_(?!\w)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function hasInlineMarks(text: string) {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text);
}

export function renderInline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, n = 0;
  TOKEN.lastIndex = 0;
  for (const m of text.matchAll(TOKEN)) {
    const t = m[0], at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${n++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold">{renderInline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("~~")) out.push(<s key={k} className="text-muted-foreground">{renderInline(t.slice(2, -2), k)}</s>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em] text-rose-600 dark:text-rose-400">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]("));
      const href = t.slice(t.indexOf("](") + 2, -1);
      out.push(<a key={k} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" onMouseDown={(e) => e.stopPropagation()}>{renderInline(label, k)}</a>);
    } else if (t.startsWith("http")) out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground break-all" onMouseDown={(e) => e.stopPropagation()}>{t}</a>);
    else out.push(<em key={k}>{renderInline(t.slice(1, -1), k)}</em>);
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
