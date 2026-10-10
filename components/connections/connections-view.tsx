"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Connections } from "@/lib/actions/connections";
import { addCalendar, removeCalendar } from "@/lib/actions/calendar";
import { saveYoutubeKeys } from "@/lib/actions/youtube";
import { BrandTile, type Brand } from "@/components/brand-icon";

function Status({ on, label }: { on: boolean; label?: string }) {
  return on ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
      <Check className="w-3 h-3" /> {label ?? "Connected"}
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{label ?? "Not connected"}</span>
  );
}

function Card({ brand, name, what, status, children, href, cta }: {
  brand: Brand; name: string; what: string; status: React.ReactNode; children?: React.ReactNode; href?: string; cta?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <BrandTile name={brand} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{name}</h2>
            {status}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{what}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {href && (
        <Link href={href} className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium hover:underline underline-offset-4">
          {cta ?? "Set up"} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </section>
  );
}

export function ConnectionsView({ connections: c }: { connections: Connections }) {
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything Galaxus talks to. Keys and links are stored encrypted and never shown again.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Card brand="googlecalendar" name="Google Calendar" what="Your next meeting in the top bar, the week in a dropdown. Read-only."
            status={<Status on={c.calendars.length > 0} label={c.calendars.length ? `${c.calendars.length} calendar${c.calendars.length > 1 ? "s" : ""}` : undefined} />}>
            <CalendarSetup calendars={c.calendars} />
          </Card>
        </div>

        <Card brand="claude" name="Claude · voice" what="Speak a command; Claude Code on your own subscription creates the tasks, routines and goals."
          status={<Status on={c.github} label={c.github ? "Instant start" : "10-min start"} />} href="/voice" cta="Open Voice" />

        <Card brand="claude" name="Claude · API" what="Writes outreach messages, reviews your YouTube channel and scripts Shorts."
          status={<Status on={c.anthropic} />}>
          <KeyForm saved={c.anthropic} placeholder="sk-ant-…" onSave={(v) => saveYoutubeKeys({ anthropic: v })} />
        </Card>

        <Card brand="youtube" name="YouTube" what="Sync your channel, audit every video, plan Shorts with Claude."
          status={<Status on={c.youtube} />} href="/youtube" cta="Open YouTube" />

        <Card brand="googlemaps" name="Google Places" what="Finds businesses for outreach. Capped below Google's free allowance."
          status={<Status on={c.google} label={c.google ? "Connected" : "Optional"} />} href="/outreach" cta="Outreach setup" />

        <Card brand="openstreetmap" name="OpenStreetMap" what="Free business search for outreach — no key, no billing."
          status={<Status on label="Always on" />} href="/outreach" cta="Add a search" />

        <Card brand="whatsapp" name="WhatsApp" what="Click-to-chat: messages open prefilled, you press send. Nothing is sent automatically."
          status={<Status on label="No setup" />} />

        <Card brand="github" name="GitHub" what="Runs the voice job. A fine-grained token lets Galaxus start it instantly."
          status={<Status on={c.github} label={c.github ? "Connected" : "Optional"} />} href="/voice" cta="Voice setup" />

        <Card brand="anthropic" name="AI assistants (MCP)" what="Let Claude Code, Claude Desktop or Cursor read and plan your tasks and goals."
          status={<Status on={c.mcpTokens > 0} label={c.mcpTokens ? `${c.mcpTokens} token${c.mcpTokens > 1 ? "s" : ""}` : undefined} />} href="/settings#ai" cta="Manage tokens" />
      </div>
    </div>
  );
}

function KeyForm({ saved, placeholder, onSave }: { saved: boolean; placeholder: string; onSave: (v: string) => Promise<unknown> }) {
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="flex gap-2">
      <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder={saved ? "Paste a new key to replace" : placeholder} className="input-base flex-1" />
      <button
        onClick={() => start(async () => { try { await onSave(value); setValue(""); toast.success("Saved."); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); } })}
        disabled={busy || !value.trim()} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        Save
      </button>
    </div>
  );
}

function CalendarSetup({ calendars }: { calendars: Connections["calendars"] }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3">
      {calendars.length > 0 && (
        <ul className="space-y-1.5">
          {calendars.map((f) => (
            <li key={f.index} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="flex-1 truncate">{f.label} <span className="text-muted-foreground text-xs">· {f.host}</span></span>
              <button
                onClick={() => start(async () => { await removeCalendar(f.index); toast.success("Calendar removed."); })}
                aria-label={`Remove ${f.label}`} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="password" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className="input-base flex-1" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (Work)" className="input-base sm:w-32" />
        <button
          onClick={() => start(async () => {
            try { await addCalendar({ url, label }); setUrl(""); setLabel(""); toast.success("Calendar connected — your next meeting shows in the top bar."); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't connect."); }
          })}
          disabled={busy || !url.trim()}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Connect
        </button>
      </div>
      <ol className={cn("text-xs text-muted-foreground list-decimal pl-4 space-y-0.5")}>
        <li>Open <a className="underline" href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">Google Calendar settings</a> and pick your calendar under &quot;Settings for my calendars&quot;.</li>
        <li>Scroll to <b>Integrate calendar</b> → copy <b>Secret address in iCal format</b>.</li>
        <li>Paste it here. It&apos;s like a password for reading that calendar — Galaxus stores it encrypted. If it ever leaks, &quot;Reset&quot; it in Google and paste the new one.</li>
      </ol>
    </div>
  );
}
