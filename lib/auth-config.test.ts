// @vitest-environment node
// The proxy's authorized() callback: guests still bounce to sign-in, and allowed
// page requests get the Report-Only CSP (with the nonce on the request headers too).
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const authorized = (path: string, loggedIn: boolean) =>
  authConfig.callbacks.authorized({ auth: loggedIn ? ({ user: { id: "1" } } as never) : null, request: new NextRequest(`https://app.test${path}`) });

describe("authorized()", () => {
  it("still refuses guests on private pages and API routes", () => {
    expect(authorized("/tasks", false)).toBe(false);
    expect(authorized("/api/upload", false)).toBe(false);
  });

  it("sends a nonce-based Report-Only CSP on allowed pages, never an enforced one", () => {
    const res = authorized("/tasks", true) as NextResponse;
    expect(res).toBeInstanceOf(NextResponse);
    const policy = res.headers.get("content-security-policy-report-only")!;
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(policy).not.toContain("'unsafe-inline' https://va"); // scripts: nonce only
    expect(res.headers.get("content-security-policy")).toBeNull();
    // Next.js reads the nonce from the forwarded request header.
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(policy);
    // Each request gets a fresh nonce.
    const other = (authorized("/", false) as NextResponse).headers.get("content-security-policy-report-only");
    expect(other).not.toBe(policy);
  });

  it("leaves API routes and the signed-in /login redirect as they were", () => {
    expect(authorized("/api/register", false)).toBe(true);
    const r = authorized("/login", true) as Response;
    expect(r.headers.get("location")).toBe("https://app.test/empire");
  });
});
