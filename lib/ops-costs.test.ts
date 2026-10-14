import { describe, expect, it } from "vitest";
import { bizName, leadCosts, qualifiedNames, type CostMission } from "@/lib/ops-costs";

const table = (rows: string[][]) => [
  "| Name | Category | Phone | WhatsApp | Email | Website status |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.join(" | ")} |`),
].join("\n");

const A = table([["Smile d.o.o.", "Dentists", "+38761111222", "yes", "", "No website"], ["Zub", "Dentists", "", "", "info@zub.ba", "Good"], ["Ghost", "Dentists", "", "", "", "No website"]]);
const B = table([["Smile", "Dentists", "+38761111222", "yes", "", "No website"], ["Fit", "Gyms", "+38733000111", "no", "", "Good"]]);

const m = (o: Partial<CostMission> & { id: number }): CostMission => ({ submittedBy: 1, kind: "research", status: "done", spentCents: 0, freeCalls: null, deliverable: null, ...o });

describe("qualified leads", () => {
  it("are table rows with a phone or an email", () => {
    expect(qualifiedNames(A)).toEqual(["smile", "zub"]);
    expect(qualifiedNames("Just prose, no table.")).toEqual([]);
    expect(qualifiedNames("| Model | Price |\n|---|---|\n| X1 | 900 |")).toEqual([]); // not a contacts table
  });
  it("match the same business however it's written", () => {
    expect(bizName("Smile d.o.o.")).toBe(bizName("SMILE"));
  });
});

describe("leadCosts", () => {
  it("divides spend (and free runs) by qualified leads and replies, per agent / kind / total", () => {
    const c = leadCosts([
      m({ id: 1, submittedBy: 7, kind: "research", spentCents: 40, freeCalls: 2, deliverable: A }),
      m({ id: 2, submittedBy: 8, kind: "procure", spentCents: 0, freeCalls: 1, deliverable: B, status: "submitted" }),
      m({ id: 3, submittedBy: 8, kind: "research", spentCents: 30, deliverable: "a write-up" }),
    ], ["Smile", "Someone else"]);
    // Smile is counted once, for the first mission that delivered it (agent 7).
    expect(c.total).toEqual({ spentCents: 70, freeCalls: 3, qualified: 3, replies: 1, perQualifiedCents: 23, perReplyCents: 70 });
    expect(c.byAgent[7]).toMatchObject({ spentCents: 40, qualified: 2, replies: 1, perQualifiedCents: 20, perReplyCents: 40 });
    expect(c.byAgent[8]).toMatchObject({ spentCents: 30, freeCalls: 1, qualified: 1, replies: 0, perQualifiedCents: 30, perReplyCents: null });
    expect(c.byKind.research).toMatchObject({ spentCents: 70, qualified: 2 });
    expect(c.byKind.procure).toMatchObject({ spentCents: 0, freeCalls: 1, qualified: 1, perQualifiedCents: 0 });
  });

  it("work that wasn't delivered (sent back, cancelled) costs but delivers nothing", () => {
    const c = leadCosts([m({ id: 1, status: "open", spentCents: 25, deliverable: A })]);
    expect(c.total).toMatchObject({ spentCents: 25, qualified: 0, perQualifiedCents: null });
  });

  it("is empty without missions", () => {
    expect(leadCosts([]).total).toEqual({ spentCents: 0, freeCalls: 0, qualified: 0, replies: 0, perQualifiedCents: null, perReplyCents: null });
  });
});
