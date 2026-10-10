"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, Check, ClipboardPaste, KeyRound, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import { Switch } from "@/components/ui/switch";
import { OSM_TYPES, osmType } from "@/lib/outreach";
import {
  addLeadSearch, deleteLeadSearch, importLeads, removePushSubscription, saveOutreachSettings, savePushSubscription,
  sendTestPush, updateLeadSearch, type OutreachState,
} from "@/lib/client/outreach";

const HOURS = Array.from({ length: 25 }, (_, h) => h);

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function Card({ title, icon, children, hint }: { title: string; icon: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2">{icon} {title}</h2>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SetupPanel({ state, onFind, finding }: { state: OutreachState; onFind: () => void; finding: boolean }) {
  const c = state.config;
  const [form, setForm] = useState({
    senderName: c.senderName,
    offer: c.offer,
    dailyVolume: c.dailyVolume,
    batches: c.batches,
    windowStart: c.windowStart,
    windowEnd: c.windowEnd,
  });
  const [pending, startTransition] = useTransition();

  function save(patch: Parameters<typeof saveOutreachSettings>[0], done = "Saved.") {
    startTransition(async () => {
      try {
        await saveOutreachSettings(patch);
        toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Campaign ─────────────────────────────────────────────────── */}
      <Card title="Campaign" icon={<Search className="w-4 h-4" />}
        hint="Galaxus finds businesses, checks their websites, drafts a message and drops small batches at random times on workdays. You press send on each one.">
        <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">{c.active ? "Running" : "Paused"}</p>
            <p className="text-xs text-muted-foreground">Mon–Fri, {c.windowStart}:00–{c.windowEnd}:00 · {c.dailyVolume} a day in {c.batches} batches</p>
          </div>
          <Switch
            checked={c.active}
            aria-label={c.active ? "Pause outreach" : "Start outreach"}
            onCheckedChange={(v) => save({ active: v }, v ? "Outreach is on. First batch today at a random time." : "Outreach paused.")}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Field label="Your name in messages">
            <input value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} className="input-base" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per day">
              <input type="number" min={1} max={40} value={form.dailyVolume} onChange={(e) => setForm({ ...form, dailyVolume: Number(e.target.value) })} className="input-base tabular-nums" />
            </Field>
            <Field label="Batches">
              <input type="number" min={1} max={6} value={form.batches} onChange={(e) => setForm({ ...form, batches: Number(e.target.value) })} className="input-base tabular-nums" />
            </Field>
          </div>
          <Field label="From">
            <select value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: Number(e.target.value) })} className="input-base">
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
          <Field label="Until">
            <select value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: Number(e.target.value) })} className="input-base">
              {HOURS.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
        </div>
        <Field label="What you offer (Claude uses this)" className="mt-3">
          <textarea
            value={form.offer}
            onChange={(e) => setForm({ ...form, offer: e.target.value })}
            rows={3}
            placeholder="Modern websites with online appointment booking, plus custom software. Delivered in 2–3 weeks."
            className="input-base h-auto py-2"
          />
        </Field>
        <button onClick={() => save(form)} disabled={pending} className="mt-4 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {pending ? "Saving…" : "Save campaign"}
        </button>
      </Card>

      <NotificationsCard state={state} />

      {/* ── Keys ─────────────────────────────────────────────────────── */}
      <Card title="API keys" icon={<KeyRound className="w-4 h-4" />}
        hint="Stored encrypted in your database. Never shown again after saving.">
        <KeyField
          label={`Google Places API key — optional · ${c.placesCalls}/${c.placesCap} requests this month`}
          isSet={c.hasGoogleKey}
          onSave={(v) => save({ googleKey: v }, v ? "Google key saved." : "Google key removed.")}
          help={
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>Open <a className="underline" href="https://console.cloud.google.com/apis/library/places.googleapis.com" target="_blank" rel="noreferrer">Places API (New)</a> in Google Cloud and click <b>Enable</b> (needs a billing account — light use stays inside the free monthly allowance).</li>
              <li>Go to <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → Create credentials → API key.</li>
              <li>Restrict the key to <b>Places API (New)</b>, then paste it here.</li>
              <li>Optional belt-and-braces: in Google Cloud → Quotas, cap Text Search at 30 requests/day.</li>
            </ol>
          }
          footnote={
            <>Free up to 1,000 requests a month (each finds up to 20 businesses). Galaxus stops at {c.placesCap}, so it never bills you. No key? The free OpenStreetMap search and paste-import still work.</>
          }
        />
        <KeyField
          label="Anthropic API key (Claude writes the messages) — optional"
          isSet={c.hasAnthropicKey}
          onSave={(v) => save({ anthropicKey: v }, v ? "Anthropic key saved." : "Anthropic key removed.")}
          help={<>From <a className="underline" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com → API keys</a>. Without it, a good Bosnian template is used.</>}
        />
      </Card>

      <SearchesCard state={state} onFind={onFind} finding={finding} />
      <PasteCard />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function KeyField({ label, isSet, onSave, help, footnote }: { label: string; isSet: boolean; onSave: (v: string) => void; help: React.ReactNode; footnote?: React.ReactNode }) {
  const [value, setValue] = useState("");
  return (
    <div className="py-3 first:pt-0 border-b border-border last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {isSet
          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Saved</span>
          : <span className="text-xs text-muted-foreground">Not set</span>}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isSet ? "Paste a new key to replace" : "Paste key"}
          className="input-base flex-1"
        />
        <button onClick={() => { onSave(value); setValue(""); }} disabled={!value.trim()} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save</button>
        {isSet && <button onClick={() => onSave("")} className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive">Remove</button>}
      </div>
      <div className="text-xs text-muted-foreground mt-2">{help}</div>
      {footnote && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2">{footnote}</p>}
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

type PushState = "checking" | "unsupported" | "ios-install" | "off" | "on" | "denied";

function NotificationsCard({ state }: { state: OutreachState }) {
  const [status, setStatus] = useState<PushState>("checking");
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    let alive = true;
    (async (): Promise<PushState> => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return ios && !standalone ? "ios-install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.getRegistration();
      return (await reg?.pushManager.getSubscription()) ? "on" : "off";
    })()
      .catch((): PushState => "unsupported")
      .then((next) => { if (alive) setStatus(next); });
    return () => { alive = false; };
  }, []);

  function enable() {
    startBusy(async () => {
      try {
        if (await Notification.requestPermission() !== "granted") { setStatus("denied"); return; }
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey) });
        await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
        setStatus("on");
        const { delivered } = await sendTestPush();
        toast.success(delivered ? "Notifications on — you should see a test one now." : "Saved, but the test didn't arrive. Try again in a minute.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't turn on notifications.");
      }
    });
  }

  function disable() {
    startBusy(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    });
  }

  const text: Record<PushState, string> = {
    checking: "Checking this device…",
    unsupported: "This browser can't receive notifications. Use Chrome/Edge on desktop or Android, or the installed app on iPhone.",
    "ios-install": "On iPhone: tap Share → Add to Home Screen, open Galaxus from the Home Screen, then come back here.",
    denied: "Notifications are blocked for Galaxus. Allow them in your browser or phone settings, then reload.",
    off: "Get a ping on this device when a batch is ready.",
    on: "This device gets a ping for every batch.",
  };

  return (
    <Card title="Notifications" icon={<Bell className="w-4 h-4" />}
      hint={`${state.pushDevices} device${state.pushDevices === 1 ? "" : "s"} enabled. Batches also appear under the bell in Galaxus.`}>
      <p className="text-sm">{text[status]}</p>
      <div className="flex gap-2 mt-3">
        {status === "off" && (
          <button onClick={enable} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enable on this device
          </button>
        )}
        {status === "on" && (
          <>
            <button onClick={() => startBusy(async () => { const r = await sendTestPush(); toast.success(r.delivered ? "Test sent." : "No device received it."); })} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">Send a test</button>
            <button onClick={disable} disabled={busy} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground">Turn off here</button>
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Searches ─────────────────────────────────────────────────────────────────

function SearchesCard({ state, onFind, finding }: { state: OutreachState; onFind: () => void; finding: boolean }) {
  const [source, setSource] = useState<"osm" | "google">(state.config.hasGoogleKey ? "google" : "osm");
  const [query, setQuery] = useState("");
  const [osmKey, setOsmKey] = useState<string>(OSM_TYPES[0].key);
  const [city, setCity] = useState("Sarajevo");
  const [category, setCategory] = useState("");
  const [busy, startBusy] = useTransition();

  const act = (fn: () => Promise<unknown>) => startBusy(async () => {
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
  });

  return (
    <Card title="Who to find" icon={<Search className="w-4 h-4" />}
      hint="OpenStreetMap is free and needs no key (fewer phone numbers — Galaxus reads them off websites). Google finds more but needs a key. When a search runs out, add another city or business type.">
      {state.searches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Turn the campaign on to start with dentists in Sarajevo, or add your own below.</p>
      ) : (
        <ul className="space-y-1.5">
          {state.searches.map((s) => {
            const exhausted = s.pagesFetched > 0 && !s.nextPageToken;
            return (
              <li key={s.id} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2", !s.active && "opacity-55")}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {s.source === "osm" ? osmType(s.query)?.label ?? s.query : s.query} · {s.city}
                    <span className={cn("ml-2 rounded px-1.5 py-px text-[10px] font-medium", s.source === "osm" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                      {s.source === "osm" ? "OSM · free" : "Google"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.category ?? "—"} · {exhausted ? "all results used" : s.pagesFetched ? `${s.pagesFetched}/3 pages` : "not run yet"}</p>
                </div>
                {exhausted && (
                  <button onClick={() => act(() => updateLeadSearch(s.id, { restart: true }))} title="Search again (picks up new businesses)" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <Switch checked={s.active} aria-label={s.active ? "Pause search" : "Resume search"} onCheckedChange={(v) => act(() => updateLeadSearch(s.id, { active: v }))} />
                <button onClick={() => act(() => deleteLeadSearch(s.id))} aria-label={`Delete ${s.query}`} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50 mt-4">
        {(["osm", "google"] as const).map((src) => (
          <button key={src} onClick={() => setSource(src)}
            className={cn("px-2.5 h-7 rounded-md text-xs", source === src ? "bg-background shadow-xs font-medium" : "text-muted-foreground")}>
            <span className="inline-flex items-center gap-1.5"><BrandIcon name={src === "osm" ? "openstreetmap" : "googlemaps"} className="w-3.5 h-3.5" />{src === "osm" ? "OpenStreetMap (free)" : "Google"}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 mt-2">
        {source === "osm" ? (
          <select value={osmKey} onChange={(e) => setOsmKey(e.target.value)} className="input-base col-span-2 sm:col-span-1">
            {OSM_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        ) : (
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. frizerski salon" className="input-base col-span-2 sm:col-span-1" />
        )}
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="input-base" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Label (optional)" className="input-base" />
        <button
          onClick={() => act(async () => {
            await addLeadSearch({ source, query: source === "osm" ? osmKey : query, city, category });
            setQuery(""); setCategory("");
          })}
          disabled={busy || (source === "google" && !query.trim()) || !city.trim()}
          className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50 col-span-2 sm:col-span-1"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      {source === "google" && !state.config.hasGoogleKey && <p className="text-xs text-muted-foreground mt-2">Google searches run once you add a key above.</p>}
      <button onClick={onFind} disabled={finding} className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find leads now
      </button>
      <p className="text-[11px] text-muted-foreground mt-3">Map data © OpenStreetMap contributors (ODbL).</p>
    </Card>
  );
}

// ─── Paste import ─────────────────────────────────────────────────────────────

function PasteCard() {
  const [text, setText] = useState("");
  const [city, setCity] = useState("Sarajevo");
  const [category, setCategory] = useState("");
  const [busy, startBusy] = useTransition();
  return (
    <Card title="Paste businesses" icon={<ClipboardPaste className="w-4 h-4" />}
      hint="Free, and works with any source: copy from Google Maps, a directory or your notes. One per line — name, phone and website in any order.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder={"Dental Studio Smile, 061 123 456, smile.ba\nOrdinacija Zubić | +387 33 444 555"}
        className="input-base h-auto py-2 font-mono text-xs" />
      <div className="flex flex-wrap gap-2 mt-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="input-base w-36" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Label (Dentist)" className="input-base w-36" />
        <button
          onClick={() => startBusy(async () => {
            try {
              const r = await importLeads(text, { city, category });
              toast.success(`Added ${r.added} of ${r.parsed} — they'll be checked and drafted on the next run.`);
              setText("");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't import."); }
          })}
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Import
        </button>
      </div>
    </Card>
  );
}
