import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader", () => {
  it("renders title, label, and subtitle", () => {
    render(<PageHeader label="Today" title="Daily Check-in" subtitle="Track your prayers and habits" />);
    expect(screen.getByRole("heading", { name: "Daily Check-in" })).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Track your prayers and habits")).toBeInTheDocument();
  });

  it("omits label and subtitle when not provided", () => {
    render(<PageHeader title="Goals" />);
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("renders the action slot when provided", () => {
    render(<PageHeader title="Goals" action={<button>Add goal</button>} />);
    expect(screen.getByRole("button", { name: "Add goal" })).toBeInTheDocument();
  });
});
