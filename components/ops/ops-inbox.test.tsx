import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OpsOverview } from "@/lib/client/ops";

const changeDecisionC = vi.fn(async () => ({ changed: true, reopened: true }));
vi.mock("@/lib/client/ops", () => ({
  changeDecisionC: (...a: unknown[]) => (changeDecisionC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  answerQuestionC: vi.fn(), markInboxReadC: vi.fn(), respondRequestC: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Inbox, inboxCount } from "./ops-inbox";

const now = Date.now();
const item = (over: Record<string, unknown>) => ({
  id: 1, kind: "question", body: "?", options: [], urgent: false, missionId: null, answer: null, answeredAt: null, readAt: null, at: new Date(now - 60_000),
  agentId: 2, agent: "Nova", provider: "claude", cloud: true, route: "direct", chiefAnswer: null, changedAt: null, ...over,
});
const data = (inbox: unknown[]) => ({ inbox, requests: [] }) as unknown as OpsOverview;

describe("Inbox with full autonomy", () => {
  const d = data([
    item({ id: 1, body: "Should I buy the domain for 30 KM?", options: ["Buy it", "Skip"], route: "held" }),
    item({ id: 2, body: "Table or list?", route: "chief" }),
    item({ id: 3, body: "Logos only, or also social media templates?", options: ["Logos only", "Both"], route: "chief", answer: "Both", chiefAnswer: "Both", answeredAt: new Date(now) }),
  ]);

  it("shows what needs you, what the Chief is deciding, and what it decided; only yours count", () => {
    render(<Inbox data={d} now={now} onChanged={() => {}} />);
    expect(screen.getByText("Needs you · 1")).toBeTruthy();
    expect(screen.getByText(/today's question already went to your phone/)).toBeTruthy();
    expect(screen.getByText(/The Chief is deciding 1 question/)).toBeTruthy();
    expect(screen.getByText(/Decided by the Chief · 1/)).toBeTruthy();
    expect(screen.getByText("Chief: Both")).toBeTruthy();
    expect(inboxCount(d)).toBe(1);
  });

  it("Change re-opens the options and sends your answer", async () => {
    const onChanged = vi.fn();
    render(<Inbox data={d} now={now} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /Change/ }));
    fireEvent.click(screen.getByRole("button", { name: "Logos only" }));
    await waitFor(() => expect(changeDecisionC).toHaveBeenCalledWith(3, "Logos only"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
