"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Target, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, INCOME_SOURCES, SOURCE_META, formatKm, monthlySeries, monthSummary, mrrKm, type Currency, type IncomeSource } from "@/lib/money";
import { CountUp } from "@/components/ui/count-up";
import { addIncomeC, deleteIncomeC, saveMoneySettingsC, saveStripeKeyC, type MoneyState } from "@/lib/client/money";

export function MoneyView({ state }: { state: MoneyState }) {
  const month = new Date().toISOString().slice(0, 7);
  const sum = monthSummary(state.entries, month, state.goalKm);
  const series = monthlySeries(state.entries, month, 6);
  const mrr = mrrKm(state.clients);
  const sourcesInChart = INCOME_SOURCES.filter((s) => series.some((m) => typeof m[s] === "number"));
  const top = Object.entries(sum.bySource).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><Wallet className="w-5 h-5" /></span>
          Money
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Every income stream in one place — clients, retainers, beats, gigs and Stripe — in KM.</p>
      </header>

      <section data-room-spot="pile" className="grid sm:grid-cols-3 gap-3 stagger">
        <div className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
          <p className="text-xs text-muted-foreground">{format(new Date(), "MMMM")} so far</p>
          <p className="text-3xl font-bold tabular-nums mt-1"><CountUp value={sum.totalCents} format={formatKm} /></p>
          {state.goalKm ? (
            <>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-emerald-500 bar-fill" style={{ width: `${sum.goalPct}%` }} /></div>
              <p className="text-xs text-muted-foreground mt-1.5">{sum.goalPct}% of your {state.goalKm.toLocaleString("en-US")} KM goal</p>
            </>
          ) : <GoalSetter />}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Recurring every month</p>
          <p className="text-3xl font-bold tabular-nums mt-1"><CountUp value={mrr} /> KM</p>
          <p className="text-xs text-muted-foreground mt-1.5">{state.clients.filter((c) => c.retainerKm).length} client retainer{state.clients.filter((c) => c.retainerKm).length === 1 ? "" : "s"}{top ? ` · top: ${SOURCE_META[top[0] as IncomeSource]?.label ?? top[0]}` : ""}</p>
        </div>
      </section>

      <section data-room-spot="shelf" className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Last 6 months</h2>
        {sourcesInChart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Add your first payment below — the chart fills in from there.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <XAxis dataKey="month" tickFormatter={(m: string) => format(new Date(m + "-15"), "MMM")} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(v) => `${Math.round(Number(v)).toLocaleString("en-US")} KM`} labelFormatter={(m) => format(new Date(String(m) + "-15"), "MMMM yyyy")} />
                {sourcesInChart.map((s) => <Bar key={s} dataKey={s} name={SOURCE_META[s].label} stackId="a" fill={SOURCE_META[s].color} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <AddIncome />

      <section data-room-spot="screen">
        <h2 className="text-sm font-semibold mb-3">Recent income</h2>
        {state.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="rounded-xl border border-border divide-y divide-border">
            {state.entries.slice(0, 40).map((e) => (
              <li key={`${e.source}-${e.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SOURCE_META[e.source as IncomeSource]?.color ?? "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{e.description ?? SOURCE_META[e.source as IncomeSource]?.label ?? e.source}</p>
                  <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>{format(new Date(e.receivedAt), "d MMM yyyy")} · {SOURCE_META[e.source as IncomeSource]?.label ?? e.source}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatKm(e.amountKmCents)}</span>
                {e.id > 0 && e.source !== "stripe" && (
                  <button onClick={() => deleteIncomeC(e.id).catch((err) => toast.error(err.message))} aria-label="Delete" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Settings state={state} />
    </div>
  );
}

function GoalSetter() {
  const [goal, setGoal] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} placeholder="Monthly goal in KM, e.g. 3000" className="input-base flex-1" />
      <button onClick={() => saveMoneySettingsC({ goalKm: Number(goal) }).then(() => toast.success("Goal set.")).catch((e) => toast.error(e.message))}
        disabled={!goal} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        <Target className="w-4 h-4" /> Set goal
      </button>
    </div>
  );
}

function AddIncome() {
  const [f, setF] = useState<{ amount: string; currency: Currency; source: IncomeSource; description: string; receivedAt: string }>({
    amount: "", currency: "KM", source: "client", description: "", receivedAt: new Date().toISOString().slice(0, 10),
  });
  const [busy, start] = useTransition();
  return (
    <section data-room-spot="prop" className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3">Add a payment</h2>
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_1.5fr_auto_auto] gap-2">
        <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="Amount" className="input-base" />
        <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} className="input-base">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as IncomeSource })} className="input-base">
          {INCOME_SOURCES.filter((s) => s !== "stripe").map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}
        </select>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What for (Dental Smile website)" className="input-base col-span-2 sm:col-span-1" />
        <input type="date" value={f.receivedAt} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} className="input-base" />
        <button
          onClick={() => start(async () => {
            try {
              await addIncomeC({ amount: Number(f.amount.replace(",", ".")), currency: f.currency, source: f.source, description: f.description, receivedAt: f.receivedAt });
              setF({ ...f, amount: "", description: "" });
              toast.success("Added 💸");
            } catch (e) { toast.error((e as Error).message); }
          })}
          disabled={busy || !f.amount} className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">EUR converts at the fixed 1.95583 rate. Beat sales from your Beat Catalog are included automatically (as USD).</p>
    </section>
  );
}

function Settings({ state }: { state: MoneyState }) {
  const [goal, setGoal] = useState(state.goalKm?.toString() ?? "");
  const [usd, setUsd] = useState(String(state.usdToKm));
  const [key, setKey] = useState("");
  const [busy, start] = useTransition();
  return (
    <details className="rounded-2xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Settings · goal, USD rate, Stripe {state.stripeConnected && <span className="ml-1 text-emerald-600 text-xs">· Stripe connected</span>}</summary>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-muted-foreground">Monthly goal (KM)</span>
          <input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} className="input-base mt-1" /></label>
        <label className="block"><span className="text-xs text-muted-foreground">1 USD = ? KM</span>
          <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} className="input-base mt-1" /></label>
      </div>
      <button onClick={() => start(async () => { try { await saveMoneySettingsC({ goalKm: goal ? Number(goal) : null, usdToKm: Number(usd) }); toast.success("Saved."); } catch (e) { toast.error((e as Error).message); } })}
        className="mt-3 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">Save</button>
      <div className="mt-5">
        <p className="text-xs text-muted-foreground">Stripe sync (daily) — paste a <b>restricted key</b> with only <b>Charges: Read</b> from <a className="underline" href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer">dashboard.stripe.com/apikeys</a>. Your own account only.</p>
        <div className="mt-2 flex gap-2">
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state.stripeConnected ? "Connected · paste to replace" : "rk_live_…"} className={cn("input-base flex-1")} />
          <button onClick={() => start(async () => { try { const r = await saveStripeKeyC(key); setKey(""); toast.success(`Stripe connected · ${r.synced} payments imported`); } catch (e) { toast.error((e as Error).message); } })}
            disabled={busy || !key} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Connect</button>
        </div>
      </div>
    </details>
  );
}
