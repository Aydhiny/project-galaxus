import { describe, expect, it } from "vitest";
import { detectAgreement, priceToKm, stageFromEmail, stageFromLead } from "./deals";

describe("deal desk", () => {
  it("spots when a client agrees — and when they don't", () => {
    expect(detectAgreement("Sounds good, let's do it. Send me the invoice")).toBe(true);
    expect(detectAgreement("When can you start?")).toBe(true);
    expect(detectAgreement("You're hired!")).toBe(true);
    expect(detectAgreement("Thanks, but we went with someone else")).toBe(false);
    expect(detectAgreement("What are your rates?")).toBe(false);
  });
  it("reads prices into KM", () => {
    expect(priceToKm("budget is $200")).toBe(360);
    expect(priceToKm("€500 for the site")).toBe(978);
    expect(priceToKm("1500 KM")).toBe(1500);
    expect(priceToKm("no price here")).toBeNull();
  });
  it("derives stages", () => {
    expect(stageFromEmail({ status: "sent", replyCount: 0, category: null, lastReplyText: null })).toBe("contacted");
    expect(stageFromEmail({ status: "sent", replyCount: 1, category: "interested", lastReplyText: "Great, let's do it" })).toBe("ready");
    expect(stageFromEmail({ status: "sent", replyCount: 2, category: "negotiation", lastReplyText: "Can you do it cheaper?" })).toBe("negotiating");
    expect(stageFromLead({ status: "client" })).toBe("won");
    expect(stageFromLead({ status: "ready" })).toBeNull();
  });
});
