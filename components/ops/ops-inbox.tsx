"use client";

// Your inbox: agents talking to you. Questions first (tap an option or type an
// answer — the agent gets it, and a mission that waited resumes), then work
// requests from linked facilities, then updates. Agent text is shown as text.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CheckCheck, Cloud, HelpCircle, Inbox as InboxIcon, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { providerOf } from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { timeAgo } from "@/components/ops/ops-feed";
import { answerQuestionC, markInboxReadC, respondRequestC, type OpsOverview } from "@/lib/client/ops";

type Item = OpsOverview["inbox"][number];

export function inboxCount(data: OpsOverview) {
  return data.inbox.filter((i) => i.kind === "question" && !i.answeredAt).length + data.requests.length;
}

export function Inbox({ data, now, onChanged }: { data: OpsOverview; now: number; onChanged: () => void }) {
  const open = data.inbox.filter((i) => i.kind === "question" && !i.answeredAt);
  const updates = data.inbox.filter((i) => i.kind === "update");
  const answered = data.inbox.filter((i) => i.kind === "question" && i.answeredAt);
  const unread = updates.filter((u) => !u.readAt).map((u) => u.id);
  const [showAnswered, setShowAnswered] = useState(false);
  const [busy, start] = useTransition();

  if (!data.inbox.length && !data.requests.length) {
    return (
      <div className="text-center py-8 text-sm text-white/50">
        <InboxIcon className="w-6 h-6 mx-auto mb-2 text-white/35" />
        Nothing yet. When an agent needs a decision or has news, it lands here (and on your phone, within your notification settings).
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-1.5">Needs your answer · {open.length}</h3>
          <ul className="space-y-2">{open.map((q) => <Question key={q.id} q={q} now={now} onChanged={onChanged} />)}</ul>
        </section>
      )}

      {data.requests.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff] mb-1.5">Requests from linked facilities</h3>
          <ul className="space-y-2">
            {data.requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-[#6b8afd]/30 bg-[#6b8afd]/10 p-2.5">
                <p className="text-[11px] text-white/55">{r.requestFromLabel} asks your crew</p>
                <p className="text-sm font-medium text-white">{r.title}</p>
                {r.brief && <p className="mt-1 text-xs text-white/65 whitespace-pre-wrap max-h-28 overflow-y-auto">{r.brief}</p>}
                <p className="mt-1 text-[10px] text-white/45">Accepting puts it on your board: your agents, your plan&apos;s budget. The result goes back to them.</p>
                <div className="mt-2 flex gap-1.5">
                  <button disabled={busy} onClick={() => start(async () => { try { await respondRequestC(r.id, true); toast.success("On your board."); onChanged(); } catch (e) { toast.error((e as Error).message); } })}
                    className="h-7 px-3 rounded-lg bg-[#6b8afd] text-[#0f1222] text-xs font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Accept</button>
                  <button disabled={busy} onClick={() => start(async () => { try { await respondRequestC(r.id, false); toast.success("Declined."); onChanged(); } catch (e) { toast.error((e as Error).message); } })}
                    className="h-7 px-3 rounded-lg border border-white/15 text-xs text-white/80 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {updates.length > 0 && (
        <section>
          <div className="flex items-center mb-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Updates</h3>
            {unread.length > 0 && (
              <button disabled={busy} onClick={() => start(async () => { try { await markInboxReadC(unread); onChanged(); } catch (e) { toast.error((e as Error).message); } })}
                className="ml-auto text-[11px] text-white/55 hover:text-white inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
            )}
          </div>
          <ul className="space-y-1.5">
            {updates.map((u) => (
              <li key={u.id} className={cn("rounded-lg px-2.5 py-1.5", u.readAt ? "bg-white/[0.03]" : "bg-white/[0.07]")}>
                <Who i={u} now={now} />
                <p className="mt-0.5 text-xs text-white/85 whitespace-pre-wrap break-words">{u.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {answered.length > 0 && (
        <section>
          <button onClick={() => setShowAnswered((o) => !o)} className="text-[11px] text-white/50 hover:text-white">{showAnswered ? "Hide" : "Show"} answered ({answered.length})</button>
          {showAnswered && (
            <ul className="mt-1.5 space-y-1.5">
              {answered.map((q) => (
                <li key={q.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <Who i={q} now={now} />
                  <p className="mt-0.5 text-xs text-white/70">{q.body}</p>
                  <p className="mt-0.5 text-xs text-emerald-200">You: {q.answer}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Who({ i, now }: { i: Item; now: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/55">
      {i.cloud ? <Cloud className="w-3 h-3 text-sky-300" /> : <ProviderIcon provider={providerOf(i.provider)} className="w-3 h-3" />}
      <span className="font-semibold text-white/85">{i.agent}</span>
      {i.urgent && <span className="text-rose-300">urgent</span>}
      <span className="ml-auto tabular-nums">{timeAgo(i.at, now)}</span>
    </div>
  );
}

function Question({ q, now, onChanged }: { q: Item; now: number; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const answer = (a: string) => start(async () => {
    try {
      const r = await answerQuestionC(q.id, a);
      toast.success(r.resumed ? `Answered. ${q.agent} picks the mission back up.` : `Answered. ${q.agent} gets it at its next check-in.`);
      setText(""); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  });
  return (
    <li className={cn("rounded-xl border p-2.5", q.urgent ? "border-rose-300/40 bg-rose-500/10" : "border-amber-300/30 bg-amber-300/[0.07]")}>
      <Who i={q} now={now} />
      <p className="mt-1 text-sm text-white flex gap-1.5"><HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" />{q.body}</p>
      {q.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {q.options.map((o) => (
            <button key={o} disabled={busy} onClick={() => answer(o)} className="rounded-full px-3 py-1 text-xs bg-white/[0.08] border border-white/15 text-white hover:bg-[#6b8afd]/25 hover:border-[#6b8afd]/60 disabled:opacity-50">{o}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) answer(text.trim()); }} className="mt-2 flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={q.options.length ? "Or write your own answer" : "Your answer"}
          className="flex-1 rounded-md bg-white/[0.06] border border-white/10 px-2 py-1 text-xs text-white placeholder:text-white/35" aria-label={`Answer ${q.agent}`} />
        <button disabled={busy || !text.trim()} className="h-7 w-7 rounded-md bg-[#6b8afd] text-[#0f1222] inline-flex items-center justify-center disabled:opacity-40" aria-label="Send answer">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </li>
  );
}
