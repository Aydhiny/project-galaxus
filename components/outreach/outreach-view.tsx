"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, MapPin, MessageCircle, Phone, RefreshCw, Search, Sparkles, Star, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/db/schema";
import {
  GAP_META, LEAD_STATUSES, STATUS_LABEL, formatPhone, whatsappLink, type Gap, type LeadStatus,
} from "@/lib/outreach";
import {
  redraftLead, releaseBatchNow, runMonthlyReview, runOutreachPipeline, updateLead, type OutreachState,
} from "@/lib/actions/outreach";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SetupPanel } from "./setup-panel";
import { GapChips, STATUS_STYLE } from "./shared";
import { LeadDetail } from "./lead-sheet";

type Tab = "send" | "pipeline" | "setup";

export function OutreachView({ state }: { state: OutreachState }) {
  // Local copy for optimistic updates; re-synced whenever the server sends
  // fresh data (every action revalidates /outreach).
  const [leads, setLeads] = useState(state.leads);
  const [source, setSource] = useState(state.leads);
  if (source !== state.leads) {
    setSource(state.leads);
    setLeads(state.leads);
  }
  const needsSetup = !state.config.hasGoogleKey || !state.config.active;
  const [tab, setTab] = useState<Tab>(needsSetup && state.leads.length === 0 ? "setup" : "send");
  const [openId, setOpenId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const queued = leads.filter((l) => l.status === "queued").sort((a, b) => (b.channel === "whatsapp" ? 1 : 0) - (a.channel === "whatsapp" ? 1 : 0) || b.score - a.score);
  const awaiting = leads.filter((l) => l.status === "sent").sort((a, b) => +new Date(b.sentAt ?? 0) - +new Date(a.sentAt ?? 0));
  const ready = state.counts.ready ?? 0;
  const openLead = leads.find((l) => l.id === openId) ?? null;
  const nextSlot = state.today.slots.find((s) => !s.releasedAt);

  function patchLocal(id: number, patch: Partial<Lead>) {
    setLeads((xs) => xs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function setStatus(lead: Lead, status: LeadStatus, opts: { undo?: boolean; quiet?: boolean } = {}) {
    const prev = lead.status;
    patchLocal(lead.id, { status, ...(status === "sent" ? { sentAt: new Date() } : {}) });
    updateLead(lead.id, { status }).catch(() => {
      patchLocal(lead.id, { status: prev });
      toast.error("Couldn't save — try again.");
    });
    if (opts.quiet) return;
    toast.success(`${lead.name} · ${STATUS_LABEL[status]}`, opts.undo
      ? { action: { label: "Undo", onClick: () => setStatus({ ...lead, status }, prev as LeadStatus, { quiet: true }) } }
      : undefined);
  }

  function run(label: string, fn: () => Promise<string>) {
    startTransition(async () => {
      try {
        toast.success(await fn());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `${label} failed.`);
      }
    });
  }

  const findLeads = () => run("Finding leads", async () => {
    const r = await runOutreachPipeline();
    if (r.errors.length) throw new Error(r.errors[0]);
    return `Found ${r.found} · audited ${r.audited} · drafted ${r.drafted}${r.exhausted ? " · all searches used up — add a city or category" : ""}`;
  });
  const releaseNow = () => run("Release", async () => {
    const n = await releaseBatchNow();
    if (n === 0) throw new Error("No drafted leads in stock yet — tap “Find leads” first.");
    return `${n} leads moved to your send list.`;
  });

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outreach</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {!state.config.active
              ? "Paused — turn it on in Setup."
              : queued.length > 0
                ? `${queued.length} to send now`
                : nextSlot
                  ? `Next batch around ${nextSlot.time}`
                  : state.today.workday ? "Today's batches are done." : "Weekend — batches resume Monday."}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
          {(["send", "pipeline", "setup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 h-7 rounded-md text-sm capitalize transition-colors",
                tab === t ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "send" && queued.length > 0 ? `Send · ${queued.length}` : t}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        {[
          { label: "Sent this month", value: state.stats.sent },
          { label: "Reply rate", value: `${state.stats.replyRate}%` },
          { label: "Meetings", value: state.stats.meetings },
          { label: "Clients", value: state.stats.clients },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {tab === "send" && (
        <div className="space-y-10">
          <section aria-labelledby="to-send">
            <h2 id="to-send" className="text-sm font-semibold mb-3">To send</h2>
            {queued.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-sm">
                <p className="font-medium">Nothing to send right now.</p>
                <p className="text-muted-foreground mt-1">
                  {ready > 0
                    ? `${ready} drafted lead${ready === 1 ? "" : "s"} waiting in stock. You'll get a notification when the next batch drops.`
                    : "No drafted leads in stock yet."}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {ready > 0 && (
                    <button onClick={releaseNow} disabled={pending} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                      Send a batch now
                    </button>
                  )}
                  <button onClick={findLeads} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find leads
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {queued.map((lead) => (
                  <SendCard
                    key={lead.id}
                    lead={lead}
                    canRewrite={state.config.hasAnthropicKey}
                    onSent={() => setStatus(lead, "sent", { undo: true })}
                    onSkip={() => setStatus(lead, "skipped", { undo: true })}
                    onMessage={(message) => {
                      patchLocal(lead.id, { message });
                      updateLead(lead.id, { message }).catch(() => toast.error("Couldn't save the message."));
                    }}
                    onRewritten={(row) => patchLocal(lead.id, row)}
                    onOpen={() => setOpenId(lead.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {awaiting.length > 0 && (
            <section aria-labelledby="awaiting">
              <h2 id="awaiting" className="text-sm font-semibold mb-1">Waiting for a reply</h2>
              <p className="text-xs text-muted-foreground mb-3">When someone answers on WhatsApp, log it here — it powers your reply-rate and monthly review.</p>
              <ul className="rounded-xl border border-border divide-y divide-border">
                {awaiting.slice(0, 30).map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <button onClick={() => setOpenId(lead.id)} className="flex-1 min-w-40 text-left">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        Sent {lead.sentAt ? format(new Date(lead.sentAt), "EEE d MMM") : ""}
                      </p>
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => setStatus(lead, "replied", { undo: true })} className="h-7 px-2 rounded-md text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20">Replied</button>
                      <button onClick={() => setStatus(lead, "not_interested", { undo: true })} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-accent">Not interested</button>
                      <button onClick={() => setStatus(lead, "do_not_contact", { undo: true })} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="They replied NE — never contact again">Said NE</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "pipeline" && (
        <PipelineTab
          leads={leads}
          state={state}
          pending={pending}
          onOpen={(l) => setOpenId(l.id)}
          onFind={findLeads}
          onReview={() => run("Review", async () => { await runMonthlyReview(); return "Monthly review ready."; })}
        />
      )}

      {tab === "setup" && <SetupPanel state={state} onFind={findLeads} finding={pending} />}

      <Sheet open={openLead !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto">
          {openLead && (
            <LeadDetail
              key={openLead.id}
              lead={openLead}
              onPatch={(patch) => {
                patchLocal(openLead.id, patch as Partial<Lead>);
                updateLead(openLead.id, patch).then((row) => patchLocal(openLead.id, row)).catch(() => toast.error("Couldn't save."));
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Send card ────────────────────────────────────────────────────────────────

function SendCard({ lead, canRewrite, onSent, onSkip, onMessage, onRewritten, onOpen }: {
  lead: Lead;
  canRewrite: boolean;
  onSent: () => void;
  onSkip: () => void;
  onMessage: (m: string) => void;
  onRewritten: (row: Lead) => void;
  onOpen: () => void;
}) {
  const [draft, setDraft] = useState(lead.message ?? "");
  const [synced, setSynced] = useState(lead.message);
  if (synced !== lead.message) {
    setSynced(lead.message);
    setDraft(lead.message ?? "");
  }
  const [rewriting, startRewrite] = useTransition();
  const phone = lead.phone ?? "";

  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <h3 className="font-semibold truncate">{lead.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
            {lead.rating != null && (
              <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{lead.rating.toFixed(1)} ({lead.reviewCount ?? 0})</span>
            )}
            <span>{formatPhone(phone)}</span>
            {lead.city && <span>{lead.city}</span>}
          </p>
        </button>
        {lead.mapsUrl && (
          <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Open in Google Maps">
            <MapPin className="w-4 h-4" />
          </a>
        )}
      </div>
      <div className="mt-2"><GapChips gaps={lead.gaps} /></div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (lead.message ?? "")) onMessage(draft); }}
        rows={8}
        className="mt-3 w-full rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed resize-y"
        aria-label={`Message to ${lead.name}`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lead.channel === "whatsapp" ? (
          <a
            href={whatsappLink(phone, draft)}
            target="_blank"
            rel="noreferrer"
            onClick={() => { if (draft !== (lead.message ?? "")) onMessage(draft); onSent(); }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
          >
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </a>
        ) : (
          <>
            <a href={`tel:${phone}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
              <Phone className="w-4 h-4" /> Call {formatPhone(phone)}
            </a>
            <button onClick={onSent} className="h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent">Mark contacted</button>
          </>
        )}
        <span className="flex-1" />
        {canRewrite && (
          <button
            onClick={() => startRewrite(async () => {
              try { onRewritten(await redraftLead(lead.id)); } catch { toast.error("Couldn't rewrite — try again."); }
            })}
            disabled={rewriting}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Rewrite
          </button>
        )}
        <button onClick={onSkip} className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="w-4 h-4" /> Skip
        </button>
      </div>
      {lead.channel !== "whatsapp" && (
        <p className="mt-2 text-xs text-muted-foreground">Landline — WhatsApp won&apos;t reach it. Call, or skip.</p>
      )}
    </article>
  );
}

// ─── Pipeline tab ─────────────────────────────────────────────────────────────

function PipelineTab({ leads, state, pending, onOpen, onFind, onReview }: {
  leads: Lead[];
  state: OutreachState;
  pending: boolean;
  onOpen: (l: Lead) => void;
  onFind: () => void;
  onReview: () => void;
}) {
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const c: Partial<Record<LeadStatus, number>> = {};
    for (const l of leads) c[l.status as LeadStatus] = (c[l.status as LeadStatus] ?? 0) + 1;
    return c;
  }, [leads]);
  const shown = leads
    .filter((l) => (filter === "all" ? l.status !== "skipped" : l.status === filter))
    .filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.score - a.score);
  const variants = Object.entries(state.stats.byVariant).sort((a, b) => b[1].sent - a[1].sent);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> This month</h2>
          <button onClick={onReview} disabled={pending || !state.config.hasAnthropicKey}
            title={state.config.hasAnthropicKey ? undefined : "Add an Anthropic key in Setup"}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Ask Claude for a review
          </button>
        </div>
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">Send your first batch — reply rates by message type appear here.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {variants.map(([v, s]) => (
              <li key={v} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate text-muted-foreground">{v.replace(/^template:/, "Template · ").replace(/^claude:/, "Claude · ")}</span>
                <span className="tabular-nums">{s.replied}/{s.sent}</span>
                <span className="w-12 text-right tabular-nums font-medium">{Math.round((s.replied / s.sent) * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
        {state.config.lastReview && (
          <div className="mt-4 rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground mb-1" suppressHydrationWarning>
              Claude&apos;s review · {state.config.lastReviewAt ? format(new Date(state.config.lastReviewAt), "d MMM") : ""}
            </p>
            <p className="text-sm whitespace-pre-line">{state.config.lastReview}</p>
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" className="w-full h-9 rounded-lg border border-border bg-transparent pl-8 pr-3 text-sm" />
          </div>
          <button onClick={onFind} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Find leads
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={leads.length - (counts.skipped ?? 0)} />
          {LEAD_STATUSES.filter((s) => counts[s]).map((s) => (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={STATUS_LABEL[s]} count={counts[s]!} />
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            {leads.length === 0 ? "No leads yet. Add your Google key in Setup, then tap Find leads." : "Nothing matches."}
          </p>
        ) : (
          <ul className="rounded-xl border border-border divide-y divide-border">
            {shown.slice(0, 200).map((l) => (
              <li key={l.id}>
                <button onClick={() => onOpen(l)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[l.gaps.map((g) => GAP_META[g as Gap]?.label ?? g).join(" · ") || l.skipReason?.replace(/_/g, " "), formatPhone(l.phone)].filter(Boolean).join(" — ")}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-8 text-right" title="Priority score">{l.score}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", STATUS_STYLE[l.status as LeadStatus])}>
                    {STATUS_LABEL[l.status as LeadStatus] ?? l.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-full text-xs border transition-colors",
        active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label} <span className="opacity-60 ml-0.5 tabular-nums">{count}</span>
    </button>
  );
}
