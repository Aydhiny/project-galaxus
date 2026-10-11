"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Connections } from "@/lib/actions/connections";
import { addCalendar, removeCalendar } from "@/lib/client/calendar";
import { saveYoutubeKeys } from "@/lib/client/youtube";
import { saveOutreachSettings } from "@/lib/client/outreach";
import { saveStripeKeyC } from "@/lib/client/money";
import { saveRedditKeyC } from "@/lib/client/gigs";
import { connectGmailC } from "@/lib/client/autopilot";
import { saveVoiceGithubKey } from "@/lib/client/voice";
import { BrandTile, type Brand } from "@/components/brand-icon";
import { RedditConnectionCard } from "@/components/connections/reddit-connection";
import type { RedditConnection } from "@/lib/client/reddit";

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

/** Every connector Galaxus has, grouped — each one connectable right here. */
export function ConnectionsView({ connections: c, reddit }: { connections: Connections; reddit: RedditConnection }) {
  const total = 13;
  const on = [c.calendars.length > 0, c.gmail, c.anthropic, c.claudeRunner, c.youtube, c.google, c.foursquare, c.stripe, c.redditApp, c.github, c.mcpTokens > 0, reddit.connected, true].filter(Boolean).length;
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">Everything Galaxus talks to. Keys are stored encrypted and never shown again.</p>
        </div>
        <p className="font-hud uppercase tracking-wide text-2xl tabular-nums">{on}<span className="text-muted-foreground text-base">/{total} connected</span></p>
      </header>

      <Group title="AI">
        <Card brand="claude" name="Claude · subscription runner" what="Your Claude Code subscription runs voice commands, gig scoring, the daily brief and email replies (GitHub Actions)."
          status={<Status on={c.claudeRunner} label={c.claudeRunner ? "Working" : "Token expired"} />}>
          {!c.claudeRunner && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>The last job failed to authenticate. In a terminal, run these two (free alternatives keep working meanwhile):</p>
              <pre className="rounded-lg bg-muted p-2 font-mono text-[11px] overflow-x-auto">claude setup-token{"\n"}gh secret set CLAUDE_CODE_OAUTH_TOKEN</pre>
            </div>
          )}
        </Card>
        <Card brand="claude" name="Claude · API key" what="Writes outreach messages, reviews your YouTube channel and scripts Shorts (pay-as-you-go)."
          status={<Status on={c.anthropic} />}>
          <KeyForm saved={c.anthropic} placeholder="sk-ant-…" onSave={(v) => saveYoutubeKeys({ anthropic: v })} />
        </Card>
        <Card brand="anthropic" name="AI assistants (MCP)" what="Let Claude Code, Claude Desktop or Cursor read and plan your tasks and goals."
          status={<Status on={c.mcpTokens > 0} label={c.mcpTokens ? `${c.mcpTokens} token${c.mcpTokens > 1 ? "s" : ""}` : undefined} />} href="/settings#ai" cta="Create a token" />
      </Group>

      <Group title="Google">
        <div className="md:col-span-2">
          <Card brand="googlecalendar" name="Google Calendar" what="Your next meeting in the top bar, the week in a dropdown. Read-only."
            status={<Status on={c.calendars.length > 0} label={c.calendars.length ? `${c.calendars.length} calendar${c.calendars.length > 1 ? "s" : ""}` : undefined} />}>
            <CalendarSetup calendars={c.calendars} />
          </Card>
        </div>
        <Card brand="gmail" name="Gmail" what="Gig autopilot sends applications from your Gmail and answers routine client replies within minutes."
          status={<Status on={c.gmail} />}>
          <GmailForm saved={c.gmail} />
        </Card>
        <Card brand="youtube" name="YouTube Data API" what="Sync your channel, audit videos, plan Shorts. A Google API key (AIza…)."
          status={<Status on={c.youtube} />}>
          <KeyForm saved={c.youtube} placeholder="AIza…" onSave={(v) => saveYoutubeKeys({ youtube: v })} />
        </Card>
        <Card brand="googlemaps" name="Google Places" what="Finds businesses for outreach. Capped below Google's free allowance."
          status={<Status on={c.google} label={c.google ? "Connected" : "Optional"} />}>
          <KeyForm saved={c.google} placeholder="AIza…" onSave={(v) => saveOutreachSettings({ googleKey: v })} />
        </Card>
      </Group>

      <Group title="Money">
        <Card brand="stripe" name="Stripe" what="Payments from clients show up in Money automatically. Use a restricted read-only key."
          status={<Status on={c.stripe} />}>
          <KeyForm saved={c.stripe} placeholder="rk_live_… (read-only)" onSave={(v) => saveStripeKeyC(v)} />
        </Card>
        <Card brand="whatsapp" name="WhatsApp" what="Click-to-chat: messages open prefilled, you press send. Nothing is sent automatically."
          status={<Status on label="No setup" />} />
      </Group>

      <Group title="Gigs, leads & community">
        <Card brand="reddit" name="Reddit · gig radar" what="Optional app key so the gig radar reads Reddit through the official API (more reliable than RSS)."
          status={<Status on={c.redditApp} label={c.redditApp ? "Connected" : "RSS (no key)"} />}>
          <PairForm saved={c.redditApp} a="Client ID" b="Client secret" onSave={(clientId, clientSecret) => saveRedditKeyC({ clientId, clientSecret })} />
        </Card>
        <RedditConnectionCard connection={reddit} />
        <Card brand="foursquare" name="Foursquare" what="Second free lead source — often has the phone numbers OpenStreetMap is missing."
          status={<Status on={c.foursquare} label={c.foursquare ? "Connected" : "Optional"} />}>
          <KeyForm saved={c.foursquare} placeholder="Service API key" onSave={(v) => saveOutreachSettings({ foursquareKey: v })} />
        </Card>
        <Card brand="openstreetmap" name="OpenStreetMap" what="Free business search for outreach — no key, no billing."
          status={<Status on label="Always on" />} href="/outreach" cta="Auto-scout" />
        <Card brand="ycombinator" name="Job boards" what="Remotive, RemoteOK, We Work Remotely and Hacker News — read for freelance and contract gigs."
          status={<Status on label="Always on" />} href="/gigs" cta="Gig radar" />
        <Card brand="discord" name="Discord" what="Community scout checks invite links with Discord's public API — no key, nothing joins for you."
          status={<Status on label="Always on" />} href="/community" cta="Community" />
        <Card brand="rss" name="News feeds" what="16 outlets (Al Jazeera, Klix, BBC, The Verge…) for your daily brief, with images."
          status={<Status on label="Always on" />} href="/brief" cta="Daily brief" />
      </Group>

      <Group title="Developer">
        <Card brand="github" name="GitHub" what="A fine-grained token lets Galaxus start the Claude runner instantly instead of on the next beat."
          status={<Status on={c.github} label={c.github ? "Connected" : "Optional"} />}>
          <KeyForm saved={c.github} placeholder="github_pat_…" onSave={(v) => saveVoiceGithubKey(v)} />
        </Card>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-hud uppercase tracking-wide text-sm text-muted-foreground mb-3">{title}</h2>
      <div className="grid md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function PairForm({ saved, a, b, onSave }: { saved: boolean; a: string; b: string; onSave: (a: string, b: string) => Promise<unknown> }) {
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <input value={x} onChange={(e) => setX(e.target.value)} placeholder={saved ? `New ${a.toLowerCase()}` : a} className="input-base" />
      <div className="flex gap-2">
        <input type="password" autoComplete="off" value={y} onChange={(e) => setY(e.target.value)} placeholder={b} className="input-base flex-1" />
        <button onClick={() => start(async () => { try { await onSave(x.trim(), y.trim()); setX(""); setY(""); toast.success("Saved."); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); } })}
          disabled={busy || !x.trim() || !y.trim()} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save</button>
      </div>
    </div>
  );
}

function GmailForm({ saved }: { saved: boolean }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={saved ? "Connected — enter again to replace" : "you@gmail.com"} className="input-base" />
      <div className="flex gap-2">
        <input type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="16-letter app password" className="input-base flex-1" />
        <button onClick={() => start(async () => { try { await connectGmailC({ email: email.trim(), appPassword: pass.replace(/\s/g, "") }); setEmail(""); setPass(""); toast.success("Gmail connected — sending and reading verified."); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't connect."); } })}
          disabled={busy || !email.trim() || !pass.trim()} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Google Account → Security → 2-Step Verification on → <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App passwords</a>. Also turn on IMAP in Gmail settings.</p>
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
