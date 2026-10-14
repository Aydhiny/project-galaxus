"use client";

// Skills: reusable instructions an agent follows (handed over at ops_checkin,
// or baked into a cloud agent's prompt). Built-ins ship with Galaxus; write
// your own for how YOU like things done. Opened for one agent, it assigns.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SKILLS_PER_AGENT, ROLES, roleOf } from "@/lib/ops";
import { createSkillC, deleteSkillC, updateAgentC, type OpsOverview } from "@/lib/client/ops";

const field = "w-full rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-violet-300/60";

export function SkillsPanel({ data, agentId, onClose, onChanged }: { data: OpsOverview; agentId: number | null; onClose: () => void; onChanged: () => void }) {
  const agent = agentId != null ? data.agents.find((a) => a.id === agentId) ?? null : null;
  const [assigned, setAssigned] = useState<string[]>(agent?.skills ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", blurb: "", instructions: "" });
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); }
  });

  function toggle(key: string) {
    if (!agent) return;
    const next = assigned.includes(key) ? assigned.filter((k) => k !== key) : [...assigned, key];
    if (next.length > MAX_SKILLS_PER_AGENT) { toast.error(`Up to ${MAX_SKILLS_PER_AGENT} skills per agent.`); return; }
    setAssigned(next);
    run(() => updateAgentC(agent.id, { skills: next }), next.includes(key) ? "Skill assigned." : "Skill removed.");
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-full overflow-y-auto rounded-2xl border border-white/15 bg-[#26272b] text-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-300" />{agent ? `${agent.name}'s skills` : "Skills library"}</h2>
            <p className="text-xs text-white/55 mt-0.5">
              {agent ? `Tap to give or take a skill (${assigned.length}/${MAX_SKILLS_PER_AGENT}). ${agent.name} gets them at its next check-in.` : "Reusable instructions. Open an agent's card to assign them."}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-white/10 inline-flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {data.skills.map((s) => {
            const on = assigned.includes(s.key);
            const suits = "roles" in s && Array.isArray(s.roles) && agent && s.roles.includes(roleOf(agent.role));
            return (
              <li key={s.key} className={cn("rounded-xl border p-2.5", on ? "border-violet-300/60 bg-violet-400/10" : "border-white/10 bg-white/[0.03]")}>
                <div className="flex items-start gap-2">
                  <button onClick={() => (agent ? toggle(s.key) : setOpen(open === s.key ? null : s.key))} disabled={busy} title={s.instructions} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {agent && <span className={cn("w-4 h-4 rounded border inline-flex items-center justify-center", on ? "bg-violet-300 border-violet-300 text-black" : "border-white/30")}>{on && <Check className="w-3 h-3" />}</span>}
                      {s.name}
                      {s.custom && <span className="text-[10px] text-white/45">yours</span>}
                      {suits && !on && <span className="text-[10px] text-violet-300/80">suits a {ROLES[roleOf(agent!.role)].label}</span>}
                    </p>
                    <p className="text-[11px] text-white/55 mt-0.5">{s.blurb}</p>
                  </button>
                  {s.custom && (
                    <button onClick={() => window.confirm(`Delete "${s.name}"? Agents that have it lose it.`) && run(() => deleteSkillC(Number(s.key.slice(2))), "Skill deleted.")}
                      className="h-7 w-7 rounded-md text-rose-300 hover:bg-rose-400/10 inline-flex items-center justify-center" aria-label={`Delete ${s.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                {open === s.key && <p className="mt-1.5 text-[11px] text-white/70 whitespace-pre-wrap">{s.instructions}</p>}
              </li>
            );
          })}
        </ul>

        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await createSkillC(draft); setDraft({ name: "", blurb: "", instructions: "" }); }, "Skill added to the library."); }}
          className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">Write your own</p>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name, e.g. My brand voice" maxLength={60} className={field} />
          <input value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} placeholder="One line: what it's for" maxLength={160} className={field} />
          <textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} rows={4} maxLength={4000}
            placeholder="What the agent should do, as you'd tell a new colleague. E.g. 'Write like me: short sentences, no buzzwords, Bosnian when the client is local.'" className={field} />
          <button disabled={busy || draft.name.trim().length < 2 || draft.instructions.trim().length < 10} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-violet-300 text-black text-sm font-semibold disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add skill
          </button>
        </form>
      </div>
    </div>
  );
}
