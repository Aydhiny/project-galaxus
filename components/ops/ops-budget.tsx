"use client";

// Budget & alerts: what your cloud agents may spend (spread evenly over the
// month so one busy day can't eat it), which model they use, and how often
// they may buzz your phone. Costs are measured from real runs: on a Claude
// subscription that's the API-equivalent cost of each run.

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bot, Loader2, PauseCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUsd, type CloudModel, type NotifyLevel } from "@/lib/ops";
import { Dialog, btnGhost, btnPrimary, field } from "@/components/ops/ops-dialog";
import { resumeCloudC, saveOpsSettingsC, type OpsOverview } from "@/lib/client/ops";

const MODELS: { key: CloudModel; label: string; hint: string }[] = [
  { key: "haiku", label: "Haiku", hint: "Cheapest. Fine for finding, listing, drafting." },
  { key: "sonnet", label: "Sonnet", hint: "Balanced. Good research and writing. Recommended." },
  { key: "opus", label: "Opus", hint: "Best and priciest. Burns a small budget fast." },
];
const LEVELS: { key: NotifyLevel; label: string; hint: string }[] = [
  { key: "urgent", label: "Only urgent", hint: "Blocking questions and agents stuck waiting" },
  { key: "normal", label: "Normal", hint: "Plus questions, deliveries and reports" },
  { key: "all", label: "Everything", hint: "Plus every update" },
];

export function BudgetMeter({ b }: { b: OpsOverview["budget"] }) {
  const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0);
  return (
    <div className="space-y-2">
      <div>
        <div className="flex justify-between text-[11px] text-white/60"><span>This month</span><span className="font-mono">{formatUsd(b.spentMonthCents)} / {formatUsd(b.monthlyBudgetCents)}</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={cn("h-full rounded-full", b.spentMonthCents >= b.monthlyBudgetCents ? "bg-rose-400" : "bg-[#6b8afd]")} style={{ width: `${pct(b.spentMonthCents, b.monthlyBudgetCents)}%` }} /></div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-white/60"><span>Today&apos;s share</span><span className="font-mono">{formatUsd(b.spentTodayCents)} / {formatUsd(b.allowanceToday)}</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={cn("h-full rounded-full", b.exhausted ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${pct(b.spentTodayCents, b.allowanceToday)}%` }} /></div>
        <p className="mt-1 text-[10px] text-white/45">{b.exhausted ? (b.freeFallback ? "Today's Claude share is used: cloud agents carry on with free models (if you added any)." : "Today's share is used: cloud agents have logged off until tomorrow.") : `${formatUsd(b.leftToday)} left today · ${b.runsToday} cloud run${b.runsToday === 1 ? "" : "s"} so far · ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left this month`}</p>
      </div>
    </div>
  );
}

export function BudgetDialog({ data, onClose, onChanged }: { data: OpsOverview; onClose: () => void; onChanged: () => void }) {
  const b = data.budget;
  const [usd, setUsd] = useState(String(b.monthlyBudgetCents / 100));
  const [model, setModel] = useState<CloudModel>(b.model);
  const [notify, setNotify] = useState<NotifyLevel>(b.notify);
  const [pushes, setPushes] = useState(String(b.maxPushesPerDay));
  const [autonomy, setAutonomy] = useState(b.autonomy !== "ask"); // on by default (older data has no field yet)
  const [busy, start] = useTransition();

  return (
    <Dialog title={<span className="inline-flex items-center gap-2"><Wallet className="w-4 h-4 text-[#8ea6ff]" /> Budget & alerts</span>}
      sub="Built for a $20 plan: the month's budget is spread over the days left, and cloud agents log off when today's share is used." onClose={onClose}>
      {b.paused && (
        <div className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 p-2.5 text-xs text-amber-100">
          <p className="font-semibold flex items-center gap-1.5"><PauseCircle className="w-4 h-4" /> Paused until {new Date(b.paused.until).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mt-0.5 text-amber-100/80">Your Claude plan reported a usage limit. Cloud agents resume by themselves after that.</p>
          <button disabled={busy} onClick={() => start(async () => { try { await resumeCloudC(); toast.success("Resumed."); onChanged(); } catch (e) { toast.error((e as Error).message); } })}
            className="mt-1.5 h-7 px-3 rounded-lg border border-amber-200/40 text-xs">Resume now</button>
        </div>
      )}
      <BudgetMeter b={b} />

      <label className="mt-4 block text-[11px] text-white/55">Monthly cloud budget ($)
        <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" className={cn(field, "mt-0.5")} />
      </label>
      <p className="mt-1 text-[10px] text-white/45">
        {data.claudeMode === "runner"
          ? "Runs use your Claude subscription. Measured cost is what the same run would cost on the API: a fair gauge of how much of your plan's usage it takes. Keep some headroom for your own Claude use."
          : data.claudeMode === "api" ? "Runs are billed to your Anthropic API key at these prices." : "Connect Claude first (Connections → Claude)."}
      </p>

      <p className="mt-4 text-[11px] text-white/55">Model for cloud work <span className="text-white/40">(“quick” missions always use Haiku)</span></p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {MODELS.map((m) => (
          <button key={m.key} type="button" onClick={() => setModel(m.key)} title={m.hint}
            className={cn("rounded-lg border px-2 py-1.5 text-left", model === m.key ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
            <span className="block text-xs font-semibold">{m.label}</span><span className="block text-[10px] text-white/50 leading-tight">{m.hint}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-white/55">Notify my phone</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {LEVELS.map((l) => (
          <button key={l.key} type="button" onClick={() => setNotify(l.key)} title={l.hint}
            className={cn("rounded-lg border px-2 py-1.5 text-left", notify === l.key ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
            <span className="block text-xs font-semibold">{l.label}</span><span className="block text-[10px] text-white/50 leading-tight">{l.hint}</span>
          </button>
        ))}
      </div>
      <label className="mt-2 block text-[11px] text-white/55">At most this many pushes a day
        <input value={pushes} onChange={(e) => setPushes(e.target.value)} inputMode="numeric" className={cn(field, "mt-0.5")} />
      </label>
      <p className="mt-1 text-[10px] text-white/45">Quiet hours follow your bedtime in <Link href="/settings" className="text-[#8ea6ff] hover:underline">Settings → Sleep Guardian</Link>; only urgent things get through then. Everything still lands in your inbox.</p>

      <button type="button" role="switch" aria-checked={autonomy} onClick={() => setAutonomy((v) => !v)}
        className={cn("mt-4 w-full flex items-start gap-2.5 rounded-xl border p-2.5 text-left", autonomy ? "border-[#6b8afd]/60 bg-[#6b8afd]/10" : "border-white/10 hover:bg-white/5")}>
        <span className={cn("mt-0.5 w-8 h-4.5 shrink-0 rounded-full p-0.5 transition-colors", autonomy ? "bg-[#6b8afd]" : "bg-white/20")}>
          <span className={cn("block w-3.5 h-3.5 rounded-full bg-white transition-transform", autonomy && "translate-x-3.5")} />
        </span>
        <span>
          <span className="block text-xs font-semibold inline-flex items-center gap-1"><Bot className="w-3.5 h-3.5 text-[#8ea6ff]" /> Full autonomy: the Chief answers agents&apos; questions</span>
          <span className="block text-[10px] text-white/50 leading-tight mt-0.5">Money, contacting real people, legal or account steps and your private data still come to you; change any decision in the Inbox.</span>
        </span>
      </button>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Close</button>
        <button disabled={busy} className={btnPrimary}
          onClick={() => start(async () => {
            try { await saveOpsSettingsC({ monthlyBudgetUsd: Number(usd), cloudModel: model, notify, maxPushesPerDay: Number(pushes), autonomy: autonomy ? "full" : "ask" }); toast.success("Saved."); onChanged(); onClose(); }
            catch (e) { toast.error((e as Error).message); }
          })}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save
        </button>
      </div>
    </Dialog>
  );
}
