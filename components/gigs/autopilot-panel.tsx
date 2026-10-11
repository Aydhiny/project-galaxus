"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Bot, Check, Loader2, Play, Send, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { connectGmailC, dismissConversationC, runAutopilotNowC, saveAutopilotC, sendReplyC, type AutopilotState } from "@/lib/client/autopilot";
import { BrandIcon } from "@/components/brand-icon";

const MODES = [
  { id: "off", label: "Off", hint: "Nothing automatic." },
  { id: "shadow", label: "Shadow", hint: "Decides and drafts, sends nothing — check its judgment first." },
  { id: "on", label: "On", hint: "Applies, answers routine replies and follows up from your Gmail." },
] as const;

const STATUS_TONE: Record<string, string> = {
  shadow: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  sent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

export function AutopilotPanel({ state }: { state: AutopilotState }) {
  const s = state.settings;
  const [mode, setMode] = useState(s.mode);
  const [busy, start] = useTransition();

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4" /> Autopilot</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applies by email to posts that invite it, answers routine replies within minutes, follows up once. Max {s.dailyCap}/day, never the same company twice.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50" role="group" aria-label="Autopilot mode">
          {MODES.map((m) => (
            <button key={m.id} title={m.hint}
              onClick={() => start(async () => {
                try { await saveAutopilotC({ mode: m.id }); setMode(m.id); toast.success(m.hint); } catch (e) { toast.error((e as Error).message); }
              })}
              className={cn("px-3 h-7 rounded-md text-xs font-medium",
                mode === m.id ? (m.id === "on" ? "bg-emerald-600 text-white" : "bg-background shadow-xs") : "text-muted-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label={mode === "on" ? "Sent today" : "Would send today"} value={mode === "on" ? state.today.sent : state.today.shadow} />
        <Stat label="Sent total" value={state.totals.sent} />
        <Stat label="Replies" value={state.totals.replies} />
      </div>

      {!state.gmail ? <GmailConnect /> : (
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
          <BrandIcon name="gmail" className="w-3.5 h-3.5" /> Sending as <b className="text-foreground">{state.gmail}</b>
          <button onClick={() => start(async () => { await connectGmailC(null); toast.success("Gmail disconnected."); })} className="ml-2 underline">Disconnect</button>
        </p>
      )}

      {state.needsYou.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">👋 Needs you</p>
          <ul className="mt-2 space-y-2">
            {state.needsYou.map((c) => <Conversation key={c.id} c={c} />)}
          </ul>
        </div>
      )}

      <details className="mt-5">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Rules · rate card · portfolio</summary>
        <Rules state={state} />
      </details>

      {state.activity.length > 0 && (
        <details className="mt-3" open={mode === "shadow"}>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Activity · {state.activity.length}
          </summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {state.activity.map((a) => (
              <li key={a.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase", STATUS_TONE[a.status] ?? "bg-muted")}>{a.status === "shadow" ? "would send" : a.status}</span>
                  <span className="text-sm truncate flex-1">{a.subject}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0" suppressHydrationWarning>{a.createdAt ? formatDistanceToNowStrict(new Date(a.createdAt)) : ""}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">to {a.toEmail}{a.replyCount ? ` · ${a.replyCount} repl${a.replyCount === 1 ? "y" : "ies"}${a.category ? ` (${a.category})` : ""}` : ""}{a.error ? ` · ${a.error}` : ""}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">Show email</summary>
                  <pre className="mt-1 whitespace-pre-wrap text-xs font-sans text-foreground/90 rounded-lg bg-muted/40 p-2">{a.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        onClick={() => start(async () => {
          try {
            const r = await runAutopilotNowC();
            const count = (r as { sent?: number; shadowed?: number }).sent ?? (r as { shadowed?: number }).shadowed ?? 0;
            const skipped = Object.entries((r as { skipped?: Record<string, number> }).skipped ?? {}).map(([k, v]) => `${v}× ${k}`).slice(0, 3).join(", ");
            toast.success(`${mode === "on" ? "Sent" : "Would send"} ${count}${skipped ? ` · skipped: ${skipped}` : ""}`);
          } catch (e) { toast.error((e as Error).message); }
        })}
        disabled={busy || mode === "off"}
        className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run a pass now
      </button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-muted/40 py-2"><p className="text-xl font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;
}

function GmailConnect() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium flex items-center gap-2"><BrandIcon name="gmail" className="w-4 h-4" /> Connect Gmail</p>
      <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
        <li>Turn on <a className="underline" href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">2-Step Verification</a> (needed for app passwords).</li>
        <li>Create an <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">app password</a> named “Galaxus” and paste the 16 letters below.</li>
        <li>In Gmail → Settings → Forwarding and POP/IMAP, make sure <b>IMAP</b> is enabled.</li>
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" /> Stored encrypted. Galaxus only opens replies to emails it sent. Revoke anytime in your Google account.</p>
      <div className="mt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" className="input-base" />
        <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="abcd efgh ijkl mnop" className="input-base" />
        <button
          onClick={() => start(async () => { try { await connectGmailC({ email, appPassword: pw }); setPw(""); toast.success("Gmail connected — sending and reading both verified."); } catch (e) { toast.error((e as Error).message); } })}
          disabled={busy || !email || !pw} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect
        </button>
      </div>
    </div>
  );
}

function Conversation({ c }: { c: AutopilotState["needsYou"][number] }) {
  const [text, setText] = useState(c.suggestedReply ?? "");
  const [busy, start] = useTransition();
  return (
    <li className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <p className="text-xs text-muted-foreground">{c.toEmail} · {c.category ?? "reply"} · re: {c.subject}</p>
      <p className="mt-1 text-sm whitespace-pre-line line-clamp-6">{c.lastReplyText}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Your answer…" className="mt-2 w-full rounded-lg border border-border bg-background p-2.5 text-sm" />
      <div className="mt-2 flex gap-2">
        <button onClick={() => start(async () => { try { await sendReplyC(c.id, text); toast.success("Sent from your Gmail."); } catch (e) { toast.error((e as Error).message); } })}
          disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50">
          <Send className="w-3.5 h-3.5" /> Send
        </button>
        <button onClick={() => start(async () => { await dismissConversationC(c.id); })} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-accent">
          <X className="w-3.5 h-3.5" /> Handled elsewhere
        </button>
      </div>
    </li>
  );
}

function Rules({ state }: { state: AutopilotState }) {
  const s = state.settings;
  const [f, setF] = useState({
    dailyCap: String(s.dailyCap), minScore: String(s.minScore), websiteMinKm: String(s.websiteMinKm),
    portfolioUrl: s.portfolioUrl ?? "", bookingUrl: s.bookingUrl ?? "", senderName: s.senderName ?? "", followUps: s.followUps,
  });
  const [busy, start] = useTransition();
  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-3">
      <L label="Applications per day (max 25)"><input inputMode="numeric" value={f.dailyCap} onChange={(e) => setF({ ...f, dailyCap: e.target.value.replace(/\D/g, "") })} className="input-base" /></L>
      <L label="Minimum gig score (50–95)"><input inputMode="numeric" value={f.minScore} onChange={(e) => setF({ ...f, minScore: e.target.value.replace(/\D/g, "") })} className="input-base" /></L>
      <L label="Websites: minimum price (KM)"><input inputMode="numeric" value={f.websiteMinKm} onChange={(e) => setF({ ...f, websiteMinKm: e.target.value.replace(/\D/g, "") })} className="input-base" /></L>
      <L label="Your name in emails"><input value={f.senderName} onChange={(e) => setF({ ...f, senderName: e.target.value })} className="input-base" /></L>
      <L label="Portfolio link"><input value={f.portfolioUrl} onChange={(e) => setF({ ...f, portfolioUrl: e.target.value })} className="input-base" /></L>
      <L label="Booking link (optional, e.g. cal.com)"><input value={f.bookingUrl} onChange={(e) => setF({ ...f, bookingUrl: e.target.value })} placeholder="https://cal.com/you/15min" className="input-base" /></L>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.followUps} onChange={(e) => setF({ ...f, followUps: e.target.checked })} /> One polite follow-up after 4 days of silence</label>
      <button
        onClick={() => start(async () => {
          try {
            await saveAutopilotC({ dailyCap: Number(f.dailyCap), minScore: Number(f.minScore), websiteMinKm: Number(f.websiteMinKm), portfolioUrl: f.portfolioUrl, bookingUrl: f.bookingUrl, senderName: f.senderName, followUps: f.followUps });
            toast.success("Rules saved.");
          } catch (e) { toast.error((e as Error).message); }
        })}
        disabled={busy} className="sm:col-span-2 justify-self-start inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        <Check className="w-4 h-4" /> Save rules
      </button>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
