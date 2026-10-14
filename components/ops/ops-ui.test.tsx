import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OpsOverview } from "@/lib/client/ops";

const createAgentC = vi.fn(async () => ({ agentId: 1, token: "glx_NEWTOKEN" }));
const createMissionC = vi.fn(async () => ({ id: 1 }));
const acceptMissionC = vi.fn(async () => undefined);
const reopenMissionC = vi.fn(async () => undefined);
const cancelMissionC = vi.fn(async () => undefined);
vi.mock("@/lib/client/ops", () => ({
  createAgentC: (...a: unknown[]) => (createAgentC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  createMissionC: (...a: unknown[]) => (createMissionC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  acceptMissionC: (...a: unknown[]) => (acceptMissionC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  reopenMissionC: (...a: unknown[]) => (reopenMissionC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  cancelMissionC: (...a: unknown[]) => (cancelMissionC as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
  missionToTasksC: vi.fn(async () => ({ count: 1 })), missionToPageC: vi.fn(), missionToLeadC: vi.fn(), missionToRedditC: vi.fn(), redditSubsC: vi.fn(async () => []),
  removeRecurringC: vi.fn(), standupNowC: vi.fn(), debriefNowC: vi.fn(), setDayC: vi.fn(), applyTemplateC: vi.fn(), repeatLastDayC: vi.fn(),
  removeAgentC: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { ConnectDialog } from "./ops-connect";
import { Briefing } from "./ops-briefing";
import { Feed } from "./ops-feed";
import { RemoveAgentDialog } from "./ops-dialog";

beforeEach(() => { vi.clearAllMocks(); });

describe("ConnectDialog", () => {
  it("won't create an agent without a name", () => {
    render(<ConnectDialog onClose={() => {}} onCreated={() => {}} />);
    expect((screen.getByRole("button", { name: "Create agent" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates the agent, shows the token once, and explains each client honestly", async () => {
    const onCreated = vi.fn();
    render(<ConnectDialog onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("Nova"), { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /^Scout$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cursor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => expect(screen.getByText(/shown once/)).toBeTruthy());
    expect(createAgentC).toHaveBeenCalledWith({ name: "Nova", role: "scout", provider: "cursor", cloud: false, skills: expect.arrayContaining(["b:one-minute-brief", "b:price-hunter"]) });
    expect(onCreated).toHaveBeenCalled();
    // Cursor was chosen, so its tab opens first: it has hooks now, so it's observed.
    expect(screen.getByText(/observed, not self-reported/)).toBeTruthy();
    expect(document.body.textContent).toContain("glx_NEWTOKEN");
    expect(document.body.textContent).toContain('"version": 1'); // Cursor's hooks.json

    // Claude Code: MCP + hooks that carry the agent's own token.
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(document.body.textContent).toContain("claude mcp add --transport http galaxus-ops");
    expect(document.body.textContent).toContain("claude --url");
    expect(document.body.textContent).toContain("/loop 15m");

    // A client without hooks is honest about it.
    fireEvent.click(screen.getByRole("button", { name: "Other MCP client" }));
    expect(screen.getByText(/what the agent chooses to log/)).toBeTruthy();
    // Standing orders name the agent and the tools.
    expect(document.body.textContent).toContain('You are "Nova"');
    expect(document.body.textContent).toContain("ops_submit_deliverable");
  });

  it("hires a cloud agent with no token and no snippets", async () => {
    createAgentC.mockResolvedValueOnce({ agentId: 2, token: null } as unknown as { agentId: number; token: string });
    render(<ConnectDialog onClose={() => {}} onCreated={() => {}} claudeMode="runner" />);
    fireEvent.change(screen.getByPlaceholderText("Nova"), { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: /Galaxus cloud/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(screen.getByText(/observed by construction/)).toBeTruthy());
    expect(createAgentC).toHaveBeenCalledWith(expect.objectContaining({ name: "Atlas", cloud: true, provider: "claude" }));
    expect(document.body.textContent).not.toContain("shown once");
  });

  it("shows a readable error when creation fails", async () => {
    createAgentC.mockRejectedValueOnce(new Error("You already have an agent called Nova."));
    render(<ConnectDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Nova"), { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(createAgentC).toHaveBeenCalled());
    expect(screen.queryByText(/shown once/)).toBeNull(); // stays on the form
  });
});

const today = "2026-10-14";
const agent = (id: number, name: string, role: string) => ({ id, userId: 1, tokenId: id, name, role, provider: "claude", cloud: false, skills: [], status: "idle", activity: null, activityKind: null, activityUrl: null, lastSeenAt: null, createdAt: new Date() });
const mission = (over: Record<string, unknown>) => ({
  id: 1, userId: 1, day: today, title: "Find grants", brief: null, kind: "research", agentId: null, role: "researcher", budgetCents: null, spentCents: 0, status: "open",
  deliverableTitle: null, deliverable: null, claimedAt: null, submittedAt: null, createdAt: new Date(), parentId: null, createdByAgentId: null, jobId: null,
  costMeasured: false, submittedBy: null, reopens: 0, duelId: null, prUrl: null, recurringId: null, ...over,
});
const data = (missions: unknown[], agents = [agent(1, "Sage", "researcher")]): OpsOverview =>
  ({
    now: Date.now(), day: today, tz: "Europe/Sarajevo", agents, missions, events: [], messages: [], skills: [], shift: null, scores: {}, recurring: [], links: [], prs: {},
    shiftNow: { state: "none", minutesLeft: null, lengthMin: null, label: "No shift set: agents work whenever they run" }, claudeMode: "runner",
    totals: { budgetCents: 0, spentCents: 0 },
  }) as unknown as OpsOverview;

describe("Plan panel", () => {
  it("posts a mission: title first, everything else under More options", async () => {
    const onChanged = vi.fn();
    render(<Briefing data={data([])} assignTo={null} onChanged={onChanged} />);
    fireEvent.change(screen.getByPlaceholderText("What should they do?"), { target: { value: "Compare hosting costs" } });
    fireEvent.click(screen.getByRole("button", { name: "Money" }));
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Budget ($)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Post mission/ }));
    await waitFor(() => expect(createMissionC).toHaveBeenCalled());
    expect(createMissionC).toHaveBeenCalledWith(expect.objectContaining({ title: "Compare hosting costs", kind: "finance", agentId: 1, budgetUsd: "12.5", repeat: "once" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("saves a repeating mission", async () => {
    render(<Briefing data={data([])} assignTo={null} onChanged={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("What should they do?"), { target: { value: "Gig check" } });
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "weekdays" } });
    fireEvent.click(screen.getByRole("button", { name: /Save repeating mission/ }));
    await waitFor(() => expect(createMissionC).toHaveBeenCalledWith(expect.objectContaining({ title: "Gig check", repeat: "weekdays", repeatTime: "09:00" })));
  });

  it("head-to-head needs exactly two agents", async () => {
    render(<Briefing data={data([], [agent(1, "Sage", "researcher"), agent(2, "Nova", "researcher")])} assignTo={null} onChanged={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("What should they do?"), { target: { value: "Best accounting app" } });
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    fireEvent.click(screen.getByLabelText(/Head-to-head/));
    const post = screen.getByRole("button", { name: /Post mission/ }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: "Sage" }));
    expect(post.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Nova" }));
    expect(post.disabled).toBe(false);
    fireEvent.click(post);
    await waitFor(() => expect(createMissionC).toHaveBeenCalledWith(expect.objectContaining({ duelAgentIds: [1, 2], agentId: null })));
  });

  it("aims the form at an agent when asked to give them a mission", () => {
    render(<Briefing data={data([], [agent(2, "Forge", "builder")])} assignTo={2} onChanged={() => {}} />);
    expect((screen.getByLabelText("Who") as HTMLSelectElement).value).toBe("2");
    expect(screen.getByRole("button", { name: "App feature" }).className).toContain("6b8afd"); // the builder's kind is preselected
  });

  it("shows a submitted result as plain text and lets you accept it", async () => {
    const m = mission({ status: "submitted", agentId: 1, submittedBy: 1, deliverableTitle: "Grant list", deliverable: "<script>alert(1)</script> **bold** BOOST vouchers" });
    const { container } = render(<Briefing data={data([m])} assignTo={null} onChanged={() => {}} />);
    expect(screen.getByText(/Needs your review/)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull(); // never rendered as HTML
    expect(container.textContent).toContain("<script>alert(1)</script>");
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    await waitFor(() => expect(acceptMissionC).toHaveBeenCalledWith(1));
  });

  it("sending back asks what to fix, in a dialog (no browser prompt)", async () => {
    const m = mission({ status: "submitted", agentId: 1, deliverable: "draft" });
    render(<Briefing data={data([m])} assignTo={null} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Send back/ }));
    fireEvent.change(screen.getByPlaceholderText(/Add prices in KM/), { target: { value: "Add links" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Send back" }).at(-1)!);
    await waitFor(() => expect(reopenMissionC).toHaveBeenCalledWith(1, "Add links"));
  });

  it("offers Use it on delivered results, with tasks found in the result", () => {
    const m = mission({ status: "done", agentId: 1, deliverable: "## Next steps\n- Call the bank\n- Send the form" });
    render(<Briefing data={data([m])} assignTo={null} onChanged={() => {}} />);
    fireEvent.click(screen.getByText("Find grants"));
    fireEvent.click(screen.getByRole("button", { name: /Use it/ }));
    fireEvent.click(screen.getByRole("button", { name: /Make tasks/ }));
    expect(screen.getByText("Call the bank")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add 2 to Tasks/ })).toBeTruthy();
  });

  it("flags an over-budget mission and marks measured cost", () => {
    render(<Briefing data={data([mission({ status: "claimed", agentId: 1, budgetCents: 1000, spentCents: 1500, costMeasured: true })])} assignTo={null} onChanged={() => {}} />);
    expect(screen.getByText(/over!/)).toBeTruthy();
    expect(screen.getByText("measured")).toBeTruthy();
  });
});

describe("Removing an agent", () => {
  it("explains what happens before removing", async () => {
    const action = vi.fn(async () => {});
    render(<RemoveAgentDialog agent={{ name: "Nova", role: "scout", provider: "codex", cloud: false }} holding={2} onClose={() => {}} action={action} />);
    expect(document.body.textContent).toContain("Its token stops working");
    expect(document.body.textContent).toContain("The 2 missions it holds go back on the board");
    fireEvent.click(screen.getByRole("button", { name: "Remove Nova" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
  });
});

describe("Feed", () => {
  it("explains the empty state", () => {
    render(<Feed data={data([])} now={Date.now()} onlyAgent={null} onPick={() => {}} />);
    expect(screen.getByText(/shows up here, live/)).toBeTruthy();
  });

  it("lists events with the agent's name, and only links to http(s) pages", () => {
    const d = data([]);
    d.events = [
      { id: 1, userId: 1, agentId: 1, missionId: null, kind: "browse", label: "Reading example.com", url: "https://example.com/a", at: new Date() },
    ] as unknown as OpsOverview["events"];
    render(<Feed data={d} now={Date.now()} onlyAgent={null} onPick={() => {}} />);
    expect(screen.getByText("Sage")).toBeTruthy();
    expect(screen.getByText("Reading example.com")).toBeTruthy();
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toBe("https://example.com/a");
    expect(link.rel).toContain("noopener");
  });
});
