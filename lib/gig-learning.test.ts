import { describe, expect, it } from "vitest";
import { blendScore, crossValidate, explain, gigFeatures, predict, train, type Example } from "./gig-learning";

const gig = (title: string, body = "", url = "https://www.reddit.com/r/slavelabour/comments/x") =>
  ({ title, body, source: "reddit", url, budget: null, profileId: 1 });

describe("gig learning", () => {
  it("turns a post into readable features", () => {
    const f = gigFeatures(gig("[TASK] 10 thumbnails for $50", "need them today"));
    expect(f).toContain("sub:slavelabour");
    expect(f).toContain("t:thumbnails");
    expect(f).toContain("tag:one-time");
    expect(f).toContain("per:total");
  });

  it("learns a taste from reviews and predicts unseen gigs", () => {
    // You like one-time thumbnail/shorts tasks; you dislike full-time and long-form.
    const likes = ["[TASK] 5 thumbnails for $40", "[TASK] edit 10 shorts for $100 one-time", "Quick thumbnail job $30", "[TASK] 3 shorts edit $45 one-off", "one-time shorts batch $80"];
    const dislikes = ["Full-time editor long-term daily videos", "Long-form documentary editor full time", "Full-time youtube editor ongoing", "long term editor monthly salary", "full time video editor daily uploads"];
    const ex: Example[] = [
      ...likes.map((t) => ({ features: gigFeatures(gig(t)), y: 1 as const, weight: 1 })),
      ...dislikes.map((t) => ({ features: gigFeatures(gig(t, "", "https://www.reddit.com/r/HireAnEditor/comments/y")), y: 0 as const, weight: 1 })),
    ];
    const m = train(ex);
    const good = predict(m, gigFeatures(gig("[TASK] 8 shorts for $60 one-time")));
    const bad = predict(m, gigFeatures(gig("Full-time editor for daily long-form", "", "https://www.reddit.com/r/HireAnEditor/comments/z")));
    expect(good).toBeGreaterThan(0.6);
    expect(bad).toBeLessThan(0.4);
    expect(crossValidate(ex, ex)).toBeGreaterThanOrEqual(80);
    expect(explain(m, gigFeatures(gig("[TASK] 8 shorts for $60 one-time"))).likes.length).toBeGreaterThan(0);
    const model = { ...m, samples: 10 };
    expect(blendScore(50, good, model)).toBeGreaterThan(50);
  });
});
