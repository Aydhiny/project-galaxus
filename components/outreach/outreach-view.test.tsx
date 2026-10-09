import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Lead } from "@/lib/db/schema";
import type { OutreachState } from "@/lib/actions/outreach";

const updateLead = vi.fn(async (id: number, patch: object) => ({ id, ...patch }));
vi.mock("@/lib/actions/outreach", () => ({
  updateLead: (id: number, patch: object) => updateLead(id, patch),
  redraftLead: vi.fn(),
  releaseBatchNow: vi.fn(),
  runMonthlyReview: vi.fn(),
  runOutreachPipeline: vi.fn(),
  saveOutreachSettings: vi.fn(),
  addLeadSearch: vi.fn(),
  deleteLeadSearch: vi.fn(),
  updateLeadSearch: vi.fn(),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  sendTestPush: vi.fn(),
}));

import { OutreachView } from "./outreach-view";

function lead(over: Partial<Lead>): Lead {
  return {
    id: 1, userId: 1, searchId: 1, placeId: "p1", name: "Dental Studio Smile", category: "Dentist",
    phone: "+38761123456", channel: "whatsapp", address: "Ferhadija 1, Sarajevo", city: "Sarajevo",
    website: "https://smile.ba", mapsUrl: "https://maps.google.com/?cid=1", rating: 4.9, reviewCount: 120,
    gaps: ["no_booking"], score: 52, revenueKm: null, status: "queued", skipReason: null,
    message: "Dobar dan! Ja sam Ajdin…", messageVariant: "template:no-booking", queuedFor: "2026-10-12", batch: 1,
    sentAt: null, repliedAt: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  };
}

const state = {
  config: {
    active: true, senderName: "Ajdin", offer: "", dailyVolume: 15, batches: 3, windowStart: 8, windowEnd: 18,
    timezone: "Europe/Sarajevo", hasGoogleKey: true, hasAnthropicKey: false, lastReview: null, lastReviewAt: null,
  },
  searches: [],
  leads: [
    lead({}),
    lead({ id: 2, placeId: "p2", name: "Ordinacija Zubić", phone: "+38733123456", channel: "call", gaps: ["no_website"] }),
    lead({ id: 3, placeId: "p3", name: "Dr. Hadžić", status: "sent", sentAt: new Date("2026-10-09T09:00:00Z") }),
  ],
  today: { local: { day: "2026-10-12", time: "10:00", minutes: 600, weekday: 1 }, slots: [], workday: true },
  counts: { queued: 2, sent: 1 },
  stats: { month: "2026-10", sent: 1, replies: 0, replyRate: 0, meetings: 0, clients: 0, byVariant: {}, byGap: {} },
  pushDevices: 0,
  vapidPublicKey: "BAAA",
} as unknown as OutreachState;

describe("OutreachView", () => {
  it("lists today's leads with a prefilled WhatsApp link, and Call for landlines", () => {
    render(<OutreachView state={state} />);
    expect(screen.getByRole("heading", { name: "Outreach" })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: /send on whatsapp/i });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/38761123456\?text=Dobar/);
    expect(screen.getByRole("link", { name: /call 033 123 456/i })).toBeInTheDocument();
    expect(screen.getByText("No online booking")).toBeInTheDocument();
    expect(screen.getByText("Dr. Hadžić")).toBeInTheDocument(); // waiting for a reply
  });

  it("marks a lead sent when you tap Send on WhatsApp", () => {
    updateLead.mockClear();
    render(<OutreachView state={state} />);
    fireEvent.click(screen.getByRole("link", { name: /send on whatsapp/i }));
    expect(updateLead).toHaveBeenCalledWith(1, { status: "sent" });
    expect(screen.queryByRole("link", { name: /send on whatsapp/i })).not.toBeInTheDocument();
  });

  it("logs a reply from the waiting list", () => {
    updateLead.mockClear();
    render(<OutreachView state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Replied" }));
    expect(updateLead).toHaveBeenCalledWith(3, { status: "replied" });
  });

  it("renders the pipeline and setup tabs", () => {
    render(<OutreachView state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "pipeline" }));
    expect(screen.getByPlaceholderText("Search leads")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "setup" }));
    expect(screen.getByText("Google Places API key (finds businesses)")).toBeInTheDocument();
  });
});
