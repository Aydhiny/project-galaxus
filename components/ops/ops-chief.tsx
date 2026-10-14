"use client";

// Talk to the Chief: write a direction ("focus on lawyers in Mostar tomorrow,
// skip dentists with good sites"); it becomes a standing order every plan follows
// (lib/services/ops-directions.ts). Shown on the Chief's card and in a dialog from
// the More menu. Directions and the Chief's replies are plain text, never HTML.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Megaphone, Send, X } from "lucide-react";
import { Dialog, field } from "@/components/ops/ops-dialog";
import { addDirectionC, getDirectionsC, removeDirectionC, type OpsOverview } from "@/lib/client/ops";

type Direction = Awaited<ReturnType<typeof getDirectionsC>>[number];

export function ChiefOrders({ data, onChanged }: { data: OpsOverview; onChanged: () => void }) {
  const [items, setItems] = useState<Direction[] | null>(null);
  const [text, setText] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, start] = useTransition();
  useEffect(() => {
    let dead = false;
    getDirectionsC().then((r) => { if (!dead) setItems(r); }).catch((e) => { if (!dead) setItems([]); toast.error((e as Error).message); }); // never spin forever
    return () => { dead = true; };
  }, [version]);

  // The Chief's latest word on the radio (its acknowledgement lands here a moment after you send).
  const chiefIds = new Set(data.agents.filter((a) => a.role === "chief").map((a) => a.id));
  const reply = data.messages.find((m) => m.fromAgentId != null && chiefIds.has(m.fromAgentId) && !m.toUser);
  const chiefName = reply ? data.agents.find((a) => a.id === reply.fromAgentId)?.name : null;

  const send = () => start(async () => {
    try {
      const r = await addDirectionC(text);
      setText("");
      toast.success(r.chief ? `${r.chief} has it.` : "Saved. Hire a Chief of staff to have it planned around.");
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  });
  const remove = (id: number) => start(async () => {
    try { await removeDirectionC(id); setVersion((v) => v + 1); onChanged(); } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(); }} className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Direct the Chief, e.g. “focus on lawyers in Mostar tomorrow”"
          aria-label="Direction for the Chief" className={field} />
        <button disabled={busy || !text.trim()} aria-label="Send direction" className="h-8 w-9 shrink-0 rounded-lg bg-[#6b8afd] text-[#0f1222] inline-flex items-center justify-center disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      {reply && (
        <p className="mt-1.5 text-[11px] text-white/70 line-clamp-2 break-words"><b className="text-[#c7d2ff]">{chiefName}:</b> {reply.body}</p>
      )}
      <p className="mt-2 text-[10px] uppercase tracking-wider text-white/45 inline-flex items-center gap-1"><Megaphone className="w-3 h-3" /> Chief&apos;s standing orders</p>
      <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
        {items == null && <p className="text-[11px] text-white/45 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>}
        {items?.length === 0 && <p className="text-[11px] text-white/45">None yet. Every plan the Chief makes follows what you write here.</p>}
        {items?.map((d) => (
          <div key={d.id} className="flex items-start gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1">
            <p className="flex-1 min-w-0 text-xs text-white/85 whitespace-pre-wrap break-words">{d.text}</p>
            <span className="shrink-0 text-[10px] text-white/35 mt-0.5">{new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <button disabled={busy} onClick={() => remove(d.id)} title="Remove this order" aria-label="Remove this order" className="shrink-0 h-5 w-5 rounded hover:bg-white/10 inline-flex items-center justify-center text-white/55 hover:text-rose-300">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChiefOrdersDialog({ data, onClose, onChanged }: { data: OpsOverview; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Megaphone className="w-4 h-4 text-[#8ea6ff]" /> Talk to the Chief</span>}
      sub="Directions become standing orders: the Chief plans every project day and stand-up around them, and every agent's brief carries them. Remove one when it no longer applies.">
      <ChiefOrders data={data} onChanged={onChanged} />
    </Dialog>
  );
}
