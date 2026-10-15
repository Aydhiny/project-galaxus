import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CountUp } from "./count-up";
import { Dialog } from "@/components/ops/ops-dialog";

/** Pretend the OS asks for reduced motion (or not). */
function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia by default; put it back that way
  delete window.matchMedia;
  vi.useRealTimers();
});

describe("CountUp", () => {
  it("shows the final number at once with reduced motion", () => {
    setReducedMotion(true);
    render(<CountUp value={1234} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("starts from 0 and rolls up when motion is allowed", () => {
    setReducedMotion(false);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    render(<CountUp value={1234} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(raf).toHaveBeenCalled();
    raf.mockRestore();
  });

  it("does nothing when re-rendered with the same value (a data refresh)", () => {
    setReducedMotion(false);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { rerender } = render(<CountUp value={5} animateOnMount={false} />);
    rerender(<CountUp value={5} animateOnMount={false} />);
    expect(raf).not.toHaveBeenCalled();
    expect(screen.getByText("5")).toBeInTheDocument();
    raf.mockRestore();
  });

  it("uses the given format", () => {
    setReducedMotion(true);
    render(<CountUp value={250000} format={(n) => `${Math.round(n / 100)} KM`} />);
    expect(screen.getByText("2500 KM")).toBeInTheDocument();
  });
});

describe("Ops Dialog motion", () => {
  it("closes instantly with reduced motion (no exit animation)", () => {
    setReducedMotion(true);
    const onClose = vi.fn();
    render(<Dialog title="Hi" onClose={onClose}>body</Dialog>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("plays a short exit before closing otherwise", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Dialog title="Hi" onClose={onClose}>body</Dialog>);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("data-closing");
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("reduced-motion stylesheet", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const block = css.slice(css.search(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before/));

  it("collapses every animation and transition, including stagger delays", () => {
    expect(block).toMatch(/animation-duration: 0\.01ms !important/);
    expect(block).toMatch(/animation-delay: 0s !important/);
    expect(block).toMatch(/transition-duration: 0\.01ms !important/);
  });

  it("removes the press squash and hover lift", () => {
    expect(block).toMatch(/\.press:active[^{]*\{ scale: none !important/);
    expect(block).toMatch(/\.lift:hover[^{]*\{ translate: none !important/);
  });
});
