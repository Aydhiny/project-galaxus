"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Building2, Globe, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/db/schema";
import { STATUS_LABEL, formatPhone, whatsappLink, type LeadStatus } from "@/lib/outreach";
import type { LeadPatch } from "@/lib/services/outreach/engine";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GapChips, STATUS_STYLE } from "./shared";

// The statuses you set by hand, in the order a deal moves.
const MANUAL: LeadStatus[] = ["ready", "queued", "sent", "replied", "meeting", "client", "not_interested", "do_not_contact", "skipped"];

export function LeadDetail({ lead, onPatch }: { lead: Lead; onPatch: (p: LeadPatch) => void }) {
  const [message, setMessage] = useState(lead.message ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [revenue, setRevenue] = useState(lead.revenueKm?.toString() ?? "");
  // CompanyWall has no public API — a targeted search is the honest shortcut.
  const companyWall = `https://www.google.com/search?q=${encodeURIComponent(`site:companywall.ba ${lead.name}`)}`;

  return (
    <div className="flex flex-col">
      <div className="p-6 pb-4 pr-12 border-b border-border">
        <SheetTitle className="text-lg leading-snug">{lead.name}</SheetTitle>
        <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {lead.rating != null && (
            <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{lead.rating.toFixed(1)} · {lead.reviewCount ?? 0} reviews</span>
          )}
          <span>Score {lead.score}</span>
          {lead.category && <span>{lead.category}</span>}
        </SheetDescription>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-2 text-sm">
          {lead.phone && (
            <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />
              <a href={`tel:${lead.phone}`} className="hover:underline">{formatPhone(lead.phone)}</a>
              <span className="text-xs text-muted-foreground">{lead.channel === "whatsapp" ? "mobile · WhatsApp" : "landline"}</span>
            </p>
          )}
          {lead.address && <p className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />{lead.address}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {lead.website && <LinkPill href={lead.website} icon={<Globe className="w-3.5 h-3.5" />} label="Website" />}
            {lead.mapsUrl && <LinkPill href={lead.mapsUrl} icon={<MapPin className="w-3.5 h-3.5" />} label="Maps" />}
            <LinkPill href={companyWall} icon={<Building2 className="w-3.5 h-3.5" />} label="CompanyWall" />
          </div>
        </div>

        {(lead.gaps.length > 0 || lead.skipReason) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">What&apos;s missing</p>
            <GapChips gaps={lead.gaps} />
            {lead.skipReason && <p className="text-xs text-muted-foreground mt-1.5">Skipped: {lead.skipReason.replace(/_/g, " ")}</p>}
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
          <div className="flex flex-wrap gap-1">
            {MANUAL.map((s) => (
              <button
                key={s}
                onClick={() => onPatch({ status: s })}
                aria-pressed={lead.status === s}
                className={cn(
                  "h-7 px-2.5 rounded-full text-xs transition-colors",
                  lead.status === s ? STATUS_STYLE[s] + " ring-1 ring-current/30 font-medium" : "border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2" suppressHydrationWarning>
            {lead.sentAt && <>Sent {format(new Date(lead.sentAt), "d MMM")}</>}
            {lead.repliedAt && <> · answered {format(new Date(lead.repliedAt), "d MMM")}</>}
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Annual revenue (KM) — from CompanyWall</span>
          <input
            inputMode="numeric"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => {
              const next = revenue ? Number(revenue) : null;
              if (next !== lead.revenueKm) onPatch({ revenueKm: next });
            }}
            placeholder="e.g. 250000"
            className="mt-1.5 w-full h-9 rounded-lg border border-border bg-transparent px-3 text-sm tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground">100k+ KM raises the priority; under 30k lowers it.</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => { if (message !== (lead.message ?? "")) onPatch({ message }); }}
            rows={7}
            className="mt-1.5 w-full rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed"
          />
        </label>
        {lead.phone && lead.channel === "whatsapp" && message && (
          <a href={whatsappLink(lead.phone, message)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">
            <MessageCircle className="w-4 h-4" /> Open WhatsApp chat
          </a>
        )}

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (lead.notes ?? "")) onPatch({ notes }); }}
            rows={3}
            placeholder="What they said, follow-up date, price discussed…"
            className="mt-1.5 w-full rounded-lg border border-border bg-transparent p-3 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function LinkPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs hover:bg-accent">
      {icon} {label}
    </a>
  );
}
