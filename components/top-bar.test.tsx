import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getUpcomingMeetings = vi.fn();
vi.mock("@/lib/actions/calendar", () => ({ getUpcomingMeetings: () => getUpcomingMeetings() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));

import { MeetingsPill } from "./top-bar";

describe("MeetingsPill", () => {
  it("offers to connect a calendar when none is connected", async () => {
    getUpcomingMeetings.mockResolvedValue({ connected: false, meetings: [] });
    render(<MeetingsPill />);
    expect(await screen.findByText("Connect calendar")).toBeInTheDocument();
  });

  it('says "No meetings ahead" when the calendar is empty', async () => {
    getUpcomingMeetings.mockResolvedValue({ connected: true, meetings: [] });
    render(<MeetingsPill />);
    expect(await screen.findByText("No meetings ahead")).toBeInTheDocument();
  });

  it("shows the next meeting and how soon it starts", async () => {
    const start = new Date(Date.now() + 25 * 60_000);
    getUpcomingMeetings.mockResolvedValue({
      connected: true,
      meetings: [{ id: "a", title: "Client call", start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString(), allDay: false, location: null, joinUrl: null }],
    });
    render(<MeetingsPill />);
    expect(await screen.findByText("Client call")).toBeInTheDocument();
    expect(screen.getByText(/in 2[45] min/)).toBeInTheDocument();
  });
});
