"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Copy, ExternalLink, Handshake, Loader2, Phone, Sparkles, Target, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEAL_STAGES, type DealStage } from "@/lib/deals";
import { logTheirReplyC, setDealStageC, setDealValueC, type Deal } from "@/lib/client/deals";
import { BrandIcon } from "@/components/brand-icon";

const hud = "font-hud uppercase tracking-wide";
const fmt = (n: number) => n.toLocaleString("en-US");

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "email") return <BrandIcon name="gmail" className="w-4 h-4" />;
  if (channel === "reddit") return <BrandIcon name="reddit" className="w-4 h-4" />;
  if (channel === "whatsapp") return <BrandIcon name="whatsapp" className="w-4 h-4" />;
  if (channel === "hn") return <BrandIcon name="ycombinator" className="w-4 h-4" />;
  return <Phone className="w-4 h-4 text-muted-foreground" />;
}

const STAGE_TONE: Record<DealStage, string> = {
  contacted: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  talking: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  negotiating: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  won: "bg-emerald-600 text-white",
  lost: "bg-muted text-muted-foreground",
};

export function DealsView({ deals }: { deals: Deal[] }) {
  const [stage, setStage] = useState<DealStage | "open">("open");
  const ready = deals.filter((d) => d.stage === "ready");
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipeline = open.reduce((s, d) => s + (d.valueKm ?? 0), 0);
  const won = deals.filter((d) => d.stage === "won").reduce((s, d) => s + (d.valueKm ?? 0), 0);
  const list = stage === "open" ? open.filter((d) => d.stage !== "ready") : deals.filter((d) => d.stage === stage);
  const count = (s: DealStage) => deals.filter((d) => d.stage === s).length;

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><Handshake className="w-5 h-5" /></span>
            Deal desk
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Every client conversation in one place. Rules and AI run them until there&apos;s a yes — then it&apos;s your turn.</p>
        </div>
        <div className="flex gap-5 text-right">
          <div><p className={cn("text-2xl leading-none tabular-nums", hud)}>{fmt(pipeline)} KM</p><p className="text-[11px] text-muted-foreground mt-1">open pipeline</p></div>
          <div><p className={cn("text-2xl leading-none tabular-nums text-emerald-600 dark:text-emerald-400", hud)}>{fmt(won)} KM</p><p className="text-[11px] text-muted-foreground mt-1">won</p></div>
        </div>
      </header>

      {ready.length > 0 && (
        <section className="mt-6">
          <h2 className={cn("text-lg flex items-center gap-2 mb-3", hud)}><Target className="w-4 h-4 text-emerald-500" /> Ready for you <span className="text-muted-foreground tabular-nums">{ready.length}</span></h2>
          <ul className="space-y-3">{ready.map((d, i) => <DealCard key={d.key} deal={d} index={i} highlight />)}</ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-1.5">
        <button onClick={() => setStage("open")} className={cn("h-8 px-3 rounded-full text-sm border", stage === "open" ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
          In progress <span className="text-xs opacity-60 tabular-nums">{open.length - ready.length}</span>
        </button>
        {DEAL_STAGES.filter((s) => s.key !== "ready").map((s) => (
          <button key={s.key} onClick={() => setStage(s.key)} className={cn("h-8 px-3 rounded-full text-sm border", stage === s.key ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
            {s.emoji} {s.label} <span className="text-xs opacity-60 tabular-nums">{count(s.key)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {deals.length === 0 ? "No conversations yet. Apply to gigs (Gig radar) or send outreach — every one becomes a deal here." : "Nothing in this stage."}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">{list.map((d, i) => <DealCard key={d.key} deal={d} index={i} />)}</ul>
      )}
      <p className="mt-8 text-[11px] text-muted-foreground">Email deals run automatically (Gig radar → Autopilot). Reddit, Instagram and WhatsApp stay one tap: paste their reply, get the next move, send it yourself — your accounts stay safe.</p>
    </div>
  );
}

function DealCard({ deal: d, index, highlight }: { deal: Deal; index: number; highlight?: boolean }) {
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");
  const [suggestion, setSuggestion] = useState(d.suggestion);
  const [value, setValue] = useState(d.valueKm?.toString() ?? "");
  const manual = d.channel !== "email" && !d.key.startsWith("lead:");

  function move(stage: DealStage) {
    let amount: number | null = null;
    if (stage === "won") {
      const v = prompt("Won! How much (KM)? It's added to Money.", d.valueKm?.toString() ?? "");
      if (v === null) return;
      amount = Number(v.replace(/[^\d.]/g, "")) || null;
    }
    start(async () => {
      try { await setDealStageC(d.key, stage, amount); toast.success(stage === "won" ? "🏆 Deal won!" : `Moved to ${DEAL_STAGES.find((s) => s.key === stage)?.label}`); }
      catch (e) { toast.error((e as Error).message); }
    });
  }

  return (
    <li style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
      className={cn("rounded-2xl border bg-card p-4 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both transition-colors",
        highlight ? "border-emerald-500/40 bg-emerald-500/[0.03]" : "border-border hover:border-foreground/20")}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0"><ChannelIcon channel={d.channel} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="flex-1 font-medium leading-snug">{d.title.replace(/^\s*\[(hiring|task)\]\s*/i, "")}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_TONE[d.stage])}>{DEAL_STAGES.find((s) => s.key === d.stage)?.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2" suppressHydrationWarning>
            {d.who && <span>{d.who}</span>}
            {d.lastAt && <span>· {formatDistanceToNowStrict(new Date(d.lastAt))} ago</span>}
            {d.needsYou && d.stage !== "ready" && <span className="text-rose-600 font-medium">· needs you</span>}
          </p>
        </div>
        <label className="shrink-0 flex items-center gap-1 rounded-lg border border-border px-2 h-8" title="Deal value">
          <input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="—"
            onBlur={() => { const v = value ? Number(value) : null; if (v !== d.valueKm) setDealValueC(d.key, v).catch((e) => toast.error((e as Error).message)); }}
            className={cn("w-16 bg-transparent text-right tabular-nums text-sm outline-none", hud)} />
          <span className={cn("text-xs text-muted-foreground", hud)}>KM</span>
        </label>
      </div>

      {d.lastText && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line line-clamp-4 rounded-lg bg-muted/40 p-3">{d.lastText}</p>}

      {suggestion && (
        <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
          <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> Suggested next message</p>
          <p className="text-sm whitespace-pre-line">{suggestion}</p>
          <button onClick={async () => { try { await navigator.clipboard.writeText(suggestion); toast.success("Copied — paste it in the chat."); } catch { /* blocked */ } if (d.url?.startsWith("http")) window.open(d.url, "_blank", "noopener"); }}
            className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium">
            <Copy className="w-3.5 h-3.5" /> Copy &amp; open chat
          </button>
        </div>
      )}

      {manual && !["won", "lost"].includes(d.stage) && (
        <div className="mt-3 flex gap-2">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Paste their reply from Reddit / Instagram / WhatsApp…"
            className="flex-1 rounded-lg border border-border bg-transparent p-2 text-sm" />
          <button disabled={pending || !reply.trim()}
            onClick={() => start(async () => {
              try {
                const r = await logTheirReplyC(d.key, reply);
                setReply("");
                setSuggestion(r.suggestion);
                toast.success(r.stage === "ready" ? "🎯 They agreed — over to you to close." : r.suggestion ? "Next message ready." : "Logged — this one needs your own answer.");
              } catch (e) { toast.error((e as Error).message); }
            })}
            className="shrink-0 inline-flex items-center gap-1.5 h-auto px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Next move
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        {DEAL_STAGES.filter((s) => s.key !== d.stage).map((s) => (
          <button key={s.key} onClick={() => move(s.key)} disabled={pending}
            className={cn("h-7 px-2.5 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground disabled:opacity-50", s.key === "won" && "hover:bg-emerald-500/10 hover:border-emerald-500/40")}>
            {s.emoji} {s.label}
          </button>
        ))}
        <span className="flex-1" />
        {d.url && (
          <a href={d.url} target={d.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Open">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </li>
  );
}
