import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingPillars } from "@/components/marketing/pillars";

describe("MarketingPillars", () => {
  it("renders all eight pillar cards without crashing", () => {
    render(<MarketingPillars />);
    expect(screen.getByRole("heading", { name: "Eight pillars. One dashboard." })).toBeInTheDocument();
    // GlowingCards renders a second, DOM-present-but-aria-hidden copy of each card
    // for its cursor-glow mask effect, so every title appears twice in a DOM query.
    expect(screen.getAllByText("Prayers & Spiritual")).toHaveLength(2);
    expect(screen.getAllByText("Creative & Beats")).toHaveLength(2);
    expect(screen.getAllByText("Goals")).toHaveLength(2);
  });
});
