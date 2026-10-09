import { describe, it, expect } from "vitest";
import { celebrationFor } from "./celebrate";

const base = { id: 1, title: "Wall walk-ups 3×", priority: "none" };
const goal = { emoji: "🤸", title: "Handstand" };

describe("celebrationFor", () => {
  it("goes big when the whole goal plan is finished", () => {
    const c = celebrationFor({ ...base, goalId: 1 }, { goal, goalDone: 22, goalTotal: 22 });
    expect(c.confetti).toBe("big");
    expect(c.title).toContain("plan complete");
  });

  it("celebrates finishing a phase", () => {
    const c = celebrationFor({ ...base, goalId: 1, phase: "Week 1 · Foundations" }, { goal, goalDone: 6, goalTotal: 22, phaseDone: 6, phaseTotal: 6 });
    expect(c).toMatchObject({ title: "✅ Week 1 · Foundations complete", confetti: "small" });
    expect(c.description).toContain("6/22");
  });

  it("calls out hard (high priority) and comeback tasks", () => {
    expect(celebrationFor({ ...base, priority: "high" }).confetti).toBe("small");
    expect(celebrationFor({ ...base, priority: "high" }).description).toContain("+5 pts");
    const comeback = celebrationFor({ ...base, priority: "medium", restoredAt: new Date() });
    expect(comeback.title).toContain("Comeback");
    expect(comeback.description).toContain("+6 pts");
  });

  it("shows goal progress for ordinary steps, and stays quiet for small tasks", () => {
    expect(celebrationFor({ ...base, goalId: 1 }, { goal, goalDone: 3, goalTotal: 22 }).title).toBe("Step 3/22 toward 🤸 Handstand");
    const plain = celebrationFor(base);
    expect(plain).toMatchObject({ confetti: "none", description: "+1 pt" });
  });
});
