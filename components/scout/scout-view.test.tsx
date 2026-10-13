import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ScoutOverview } from "@/lib/client/scout";

const setScoutMarkC = vi.fn(async () => undefined);
vi.mock("@/lib/client/scout", () => ({
  scanScoutNowC: vi.fn(),
  saveScoutSettingsC: vi.fn(),
  setScoutMarkC: (...a: unknown[]) => (setScoutMarkC as unknown as (...x: unknown[]) => Promise<void>)(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { ScoutView } from "./scout-view";

type Thread = ScoutOverview["threads"][number];
const base: Thread = {
  id: 1, userId: 1, threadId: "abc", subreddit: "SaaS", title: "I made $38k ARR", url: "https://www.reddit.com/r/SaaS/comments/abc/",
  author: "builder", body: "", comments: [], postedAt: null, status: "analyzed", claims: [], score: 0, mark: "new", queuedAt: null, createdAt: new Date(),
};
const claim = { claim: "Sells an AI layer for WordPress", amount: "$38k ARR", monthlyUsd: 3200, method: "SEO plus public posts", evidence: "specific" as const, selfPromo: true, replicable: 70, why: "Fits a web developer" };

const data = (threads: Thread[]): ScoutOverview => ({
  threads,
  pending: threads.filter((t) => t.status !== "analyzed").length,
  settings: { profile: "a dev", subs: ["SaaS", "webdev"] },
});

describe("ScoutView", () => {
  it("shows claims with their evidence and self-promotion labels, and counts the rest", () => {
    render(<ScoutView data={data([
      { ...base, claims: [claim], score: 34 },
      { ...base, id: 2, threadId: "def", title: "Just a joke thread", claims: [] },
      { ...base, id: 3, threadId: "ghi", title: "Still reading", status: "new" },
    ])} />);
    expect(screen.getByText("I made $38k ARR")).toBeTruthy();
    expect(screen.getByText("Sells an AI layer for WordPress")).toBeTruthy();
    expect(screen.getByText("$38k ARR")).toBeTruthy();
    expect(screen.getByText("selling it")).toBeTruthy();
    expect(screen.getByText("numbers, unproven")).toBeTruthy();
    expect(screen.getByText(/1 thread still being read/)).toBeTruthy();
    expect(screen.getByText(/1 other thread had no real earning claims/)).toBeTruthy();
    expect(screen.queryByText("Just a joke thread")).toBeNull();
  });

  it("saves a thread and moves it to the Saved tab", () => {
    render(<ScoutView data={data([{ ...base, claims: [claim], score: 34 }])} />);
    // The card's Save comes first in the page; the settings panel has its own Save further down.
    fireEvent.click(screen.getAllByRole("button", { name: /^Save$/ })[0]);
    expect(setScoutMarkC).toHaveBeenCalledWith(1, "saved");
    fireEvent.click(screen.getByRole("button", { name: /^Saved \d/ }));
    expect(screen.getByText("I made $38k ARR")).toBeTruthy();
  });

  it("hides a thread", () => {
    render(<ScoutView data={data([{ ...base, claims: [claim], score: 34 }])} />);
    fireEvent.click(screen.getByTitle("Not for me"));
    expect(setScoutMarkC).toHaveBeenCalledWith(1, "hidden");
    expect(screen.queryByText("I made $38k ARR")).toBeNull();
  });

  it("explains the empty state", () => {
    render(<ScoutView data={data([])} />);
    expect(screen.getByText(/Nothing analysed yet/)).toBeTruthy();
  });
});
