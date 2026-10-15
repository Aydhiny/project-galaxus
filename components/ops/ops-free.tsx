"use client";

// Free models: the providers from the awesome-freellm-apis directory that your
// agents fall back to when Claude is paused or today's budget is used — and use
// first for quick missions, if you like. Shows what's left today per provider
// (exact when the provider reports it, else the published limit minus what we used).

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Gift, HeartPulse, Loader2, PlugZap, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIRECTORY_URL, FREE_PROVIDERS, UNHEALTHY_AFTER, freeProvider } from "@/lib/free-llm";
import { healthLabel } from "@/lib/free-health";
import { freeVerdict, type FreeVerdict } from "@/lib/free-limits";
import { Dialog, btnGhost, btnPrimary, field } from "@/components/ops/ops-dialog";
import { moveFreeKeyC, removeFreeKeyC, saveFreeKeyC, saveNightShiftC, saveOpsSettingsC, testFreeKeyC, type OpsOverview } from "@/lib/client/ops";

type Free = OpsOverview["free"];

/** "Free · 2,340 left today" — for the top bar. */
export function freeLabel(f: Free) {
  if (!f.providers.length) return "Free models";
  if (!f.usableCount) return "Free · used up";
  return f.unlimited ? "Free · ready" : `Free · ${f.requestsLeftToday.toLocaleString("en-GB")} left`;
}

const CARD = { none: "no card", phone: "phone check", registration: "sign-up" } as const;

export function FreeModelsDialog({ data, onClose, onChanged }: { data: OpsOverview; onClose: () => void; onChanged: () => void }) {
  const f = data.free;
  const [busy, start] = useTransition();
  const [testing, setTesting] = useState<number | null>(null);
  const added = new Set(f.providers.map((p) => p.provider));
  const [pick, setPick] = useState(FREE_PROVIDERS.find((p) => !added.has(p.key))?.key ?? "custom");
  const prov = freeProvider(pick);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(prov?.models[0]?.id ?? "");
  const [baseUrl, setBaseUrl] = useState("");

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); }
  });
  const setting = (patch: { freeFallback?: boolean; freeFirst?: boolean }) => run(() => saveOpsSettingsC(patch));

  return (
    <Dialog wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Gift className="w-4 h-4 text-[#8ea6ff]" /> Free models</span>}
      sub="Free LLM APIs your agents switch to automatically when Claude runs out. They get free web search (Reach) and shared memory, so they can still research and write.">
      <div className="grid sm:grid-cols-2 gap-2">
        <Toggle on={data.budget.freeFallback} disabled={busy} onChange={(v) => setting({ freeFallback: v })}
          label="When Claude runs out, keep going on free models" hint="Paused by a usage limit, today's budget used, or Claude not connected." />
        <Toggle on={data.budget.freeFirst} disabled={busy} onChange={(v) => setting({ freeFirst: v })}
          label="Quick missions use free models first" hint="Saves your Claude plan for deep work." />
        <div className="sm:col-span-2 grid">
          <Toggle on={data.budget.nightShift} disabled={busy} onChange={(v) => run(() => saveNightShiftC(v), v ? "Night shift on: the crew works on free models while you sleep." : "Night shift off.")}
            label="Night shift: while I sleep, the crew keeps working on free models only"
            hint="Between your bedtime and wake time (Settings → Sleep Guardian, else 23:00–07:00). Claude is never used at night, so your plan's budget is untouched. You get a one-line summary in the morning." />
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-wider text-white/45">Your providers · tried in this order</p>
        <p className="text-[11px] text-white/55">{f.usableCount} usable{f.providers.length ? ` · ${f.unlimited ? "no daily cap on at least one" : `${f.requestsLeftToday.toLocaleString("en-GB")} requests left today`}` : ""}</p>
      </div>
      {f.providers.length === 0 && <p className="mt-2 text-sm text-white/60">None yet. Add one below: Groq and Gemini take a minute and need no card.</p>}
      <ul className="mt-2 space-y-1.5">
        {f.providers.map((p, i) => {
          const cooling = p.cooldownUntil ? new Date(p.cooldownUntil) : null;
          // Plain words per provider: Working / Resting until HH:MM (rate limit) / Switched model / Broken.
          const verdict = freeVerdict({ ...p, switchedFrom: p.switchedFrom ?? null }, data.now);
          const pct = p.left.limit ? Math.round(((p.left.requests ?? 0) / p.left.limit) * 100) : null;
          return (
            <li key={p.id} className={cn("rounded-xl border px-3 py-2", p.enabled ? "border-white/10 bg-white/[0.03]" : "border-white/5 opacity-60")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                <VerdictChip v={verdict} fails={p.healthFails} />
                <span className="text-[11px] font-mono text-white/50 truncate">{p.model}</span>
                <span className="ml-auto flex items-center gap-0.5">
                  <IconBtn label="Up" disabled={busy || i === 0} onClick={() => run(() => moveFreeKeyC(p.id, -1))}><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn label="Down" disabled={busy || i === f.providers.length - 1} onClick={() => run(() => moveFreeKeyC(p.id, 1))}><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn label="Test" disabled={busy || testing != null} onClick={() => { setTesting(p.id); start(async () => {
                    try { const r = await testFreeKeyC(p.id); toast.success(`${p.name} works${r.switchedFrom ? ` — switched to ${r.model} (your key can't use ${r.switchedFrom})` : ""}: “${r.reply}”${r.models.length ? ` · ${r.models.length} models available` : ""}`); onChanged(); }
                    catch (e) { toast.error((e as Error).message); } finally { setTesting(null); }
                  }); }}>{testing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}</IconBtn>
                  <IconBtn label={p.enabled ? "Turn off" : "Turn on"} disabled={busy} onClick={() => run(() => saveFreeKeyC({ provider: p.provider, model: p.model, baseUrl: p.baseUrl ?? undefined, enabled: !p.enabled }))}>
                    <span className="text-[10px] px-1">{p.enabled ? "On" : "Off"}</span>
                  </IconBtn>
                  <IconBtn label="Remove" disabled={busy} onClick={() => run(() => removeFreeKeyC(p.id), `${p.name} removed.`)}><Trash2 className="w-3.5 h-3.5 text-rose-300" /></IconBtn>
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                {p.left.requests == null
                  ? <span className="text-emerald-300">No daily request cap</span>
                  : <>
                      <span className="h-1.5 w-28 rounded-full bg-white/10 overflow-hidden"><span className={cn("block h-full rounded-full", (pct ?? 0) < 15 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${pct ?? 0}%` }} /></span>
                      <span className="font-mono text-white/75">{p.left.requests.toLocaleString("en-GB")}{p.left.limit ? ` / ${p.left.limit.toLocaleString("en-GB")}` : ""} left today</span>
                      <span className="text-white/40">{p.left.exact ? "(reported by provider)" : "(estimate)"}</span>
                    </>}
                {p.left.usedTokens > 0 && <span className="text-white/40">· {p.left.usedTokens.toLocaleString("en-GB")} tokens used</span>}
                {p.healthChecksToday > 0 && <span className="text-white/40" title="Hourly health checks are real requests: they count in today's usage.">· {p.left.used} used today, {healthLabel(p.healthChecksToday)}</span>}
              </div>
              {verdict.kind === "resting" && <p className="mt-1 text-[11px] text-amber-200">Resting until {hhmm(verdict.until)} ({verdict.why}) — the next provider takes over.{verdict.why === "rate limit" ? " This isn't a fault: it's back on its own." : ""}</p>}
              {verdict.kind === "switched" && <p className="mt-1 text-[11px] text-sky-200">Switched model to <span className="font-mono">{verdict.model}</span>: your key can&apos;t use <span className="font-mono">{verdict.from}</span> any more.</p>}
              {verdict.kind === "broken" && <p className="mt-1 text-[11px] text-rose-200/90">{verdict.fix === "key" ? "Broken: fix the key (paste a new one below), then hit Test." : verdict.fix === "model" ? "Broken: no model works for this key. Pick another model id below, then hit Test." : `Broken: ${p.healthFails} health checks failed in a row, so it's tried last. Check the key or the provider, then hit Test.`}</p>}
              {p.lastError && verdict.kind !== "working" && <p className="mt-0.5 text-[10px] text-white/40 break-words">Last error: {p.lastError}</p>}
              {!cooling && p.unhealthy && verdict.kind !== "broken" && <p className="mt-0.5 text-[10px] text-white/45">{UNHEALTHY_AFTER}+ failed checks in a row: tried last until it passes again.</p>}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 rounded-xl border border-white/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-white/45">Add or update a provider</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FREE_PROVIDERS.map((p) => (
            <button key={p.key} type="button" onClick={() => { setPick(p.key); setModel(f.providers.find((x) => x.provider === p.key)?.model ?? p.models[0]?.id ?? ""); setKey(""); }}
              className={cn("h-7 px-2.5 rounded-lg border text-xs", pick === p.key ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5", added.has(p.key) && "text-emerald-200")}>
              {p.name.replace(" (any OpenAI-compatible)", "")}{added.has(p.key) ? " ✓" : ""}
            </button>
          ))}
        </div>
        {prov && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-white/70">
              {prov.note} <span className="text-white/45">· {CARD[prov.card]}</span>
              {prov.limits.rpd != null && <span className="text-white/45"> · ~{prov.limits.rpd.toLocaleString("en-GB")} requests/day</span>}
              {prov.limits.rpm != null && <span className="text-white/45"> · {prov.limits.rpm}/min</span>}
            </p>
            {prov.key === "omniroute" && (
              <ol className="list-decimal pl-4 text-[11px] text-white/60 space-y-0.5">
                <li>Install and start OmniRoute on your PC or a VPS (npm, Docker or the desktop app; see its README) and connect a few free providers in its Dashboard.</li>
                <li>Give it an https address Galaxus can reach, e.g. <code className="font-mono text-white/80">cloudflared tunnel --url http://localhost:20128</code> (a named tunnel keeps the same address after restarts).</li>
                <li>Paste <code className="font-mono text-white/80">https://your-address/v1</code> and the key from Dashboard → Endpoints, keep the model <code className="font-mono text-white/80">auto</code>, then hit Test.</li>
                <li className="text-amber-200/80">Don&apos;t route your Claude Pro or ChatGPT subscriptions through it: that can break their terms. Keep it to free and API-key tiers.</li>
              </ol>
            )}
            {!prov.baseUrl && (
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={prov.key === "omniroute" ? "https://your-omniroute-address/v1" : "Base URL, e.g. https://api.provider.com/v1"} className={field} />
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off"
                placeholder={added.has(prov.key) ? "Key saved (leave empty to keep it)" : prov.key === "llm7" ? "Key (optional for LLM7)" : "Paste your free API key"} className={field} />
              <input value={model} onChange={(e) => setModel(e.target.value)} list={`models-${prov.key}`} placeholder="Model id" className={cn(field, "font-mono text-xs")} />
              <datalist id={`models-${prov.key}`}>{prov.models.map((m) => <option key={m.id} value={m.id} />)}</datalist>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={prov.keyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8ea6ff] hover:underline inline-flex items-center gap-1">Get a free key <ExternalLink className="w-3 h-3" /></a>
              <span className="flex-1" />
              <button disabled={busy} className={btnPrimary}
                onClick={() => run(async () => { await saveFreeKeyC({ provider: prov.key, key: key || null, model, baseUrl: baseUrl || undefined }); setKey(""); }, `${prov.name} saved. Hit Test to check it.`)}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save
              </button>
            </div>
            <p className="text-[10px] text-white/40">Keys are encrypted at rest and only used by your agents. Free tiers may use your prompts to train models: don&apos;t send anything private through them.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-white/50">
        <a href={DIRECTORY_URL} target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] hover:underline inline-flex items-center gap-1">The full directory <ExternalLink className="w-3 h-3" /></a>
        <a href="https://freellm.net" target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] hover:underline inline-flex items-center gap-1">freellm.net (live limits) <ExternalLink className="w-3 h-3" /></a>
        <span className="flex-1" />
        <button onClick={onClose} className={btnGhost}>Close</button>
      </div>
    </Dialog>
  );
}

const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function VerdictChip({ v, fails }: { v: FreeVerdict; fails: number }) {
  const look = {
    off: ["Off", "border-white/15 text-white/50"],
    untested: ["Not checked yet", "border-white/15 text-white/60"],
    working: ["Working", "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"],
    switched: ["Working · switched model", "border-sky-300/40 bg-sky-300/10 text-sky-200"],
    resting: [v.kind === "resting" ? `Resting until ${hhmm(v.until)}` : "", "border-amber-300/40 bg-amber-300/10 text-amber-200"],
    broken: [v.kind === "broken" && v.fix === "key" ? "Broken: fix the key" : "Broken", "border-rose-300/40 bg-rose-300/10 text-rose-200"],
  }[v.kind];
  return (
    <span title={v.kind === "broken" ? `${fails} failed health checks in a row` : undefined}
      className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 text-[10px]", look[1])}>
      {v.kind === "broken" && <HeartPulse className="w-3 h-3" />}{look[0]}
    </span>
  );
}

function Toggle({ on, label, hint, onChange, disabled }: { on: boolean; label: string; hint: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("flex items-start gap-2.5 rounded-xl border p-2.5 text-left", on ? "border-[#6b8afd]/60 bg-[#6b8afd]/10" : "border-white/10 hover:bg-white/5")}>
      <span className={cn("mt-0.5 w-8 h-4.5 shrink-0 rounded-full p-0.5 transition-colors", on ? "bg-[#6b8afd]" : "bg-white/20")}>
        <span className={cn("block w-3.5 h-3.5 rounded-full bg-white transition-transform", on && "translate-x-3.5")} />
      </span>
      <span><span className="block text-xs font-semibold">{label}</span><span className="block text-[10px] text-white/50 leading-tight mt-0.5">{hint}</span></span>
    </button>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="h-7 min-w-7 px-1 rounded-lg hover:bg-white/10 inline-flex items-center justify-center text-white/75 disabled:opacity-30">{children}</button>
  );
}
