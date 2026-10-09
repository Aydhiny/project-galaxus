import { describe, it, expect } from "vitest";
import { safeCallbackUrl } from "./safe-redirect";

const ORIGIN = "https://galaxus.app";

describe("safeCallbackUrl", () => {
  it("keeps same-origin paths, including absolute same-origin URLs", () => {
    expect(safeCallbackUrl("/tasks?view=board", ORIGIN)).toBe("/tasks?view=board");
    expect(safeCallbackUrl("https://galaxus.app/pages/3", ORIGIN)).toBe("/pages/3");
  });

  it("blocks open redirects", () => {
    expect(safeCallbackUrl("https://evil.com", ORIGIN)).toBe("/overview");
    expect(safeCallbackUrl("//evil.com/x", ORIGIN)).toBe("/overview");
    expect(safeCallbackUrl("/\\evil.com", ORIGIN)).toBe("/overview"); // browsers treat "\" as "/"
    expect(safeCallbackUrl("javascript:alert(1)", ORIGIN)).toBe("/overview");
  });

  it("never loops back to auth pages", () => {
    expect(safeCallbackUrl("/login", ORIGIN)).toBe("/overview");
    expect(safeCallbackUrl(null, ORIGIN)).toBe("/overview");
  });
});
