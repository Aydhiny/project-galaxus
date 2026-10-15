// @vitest-environment node
//
// Security checks against a REAL Postgres (PGlite) with the app's schema and the
// production migration statements (same harness as ops-round3.db.test.ts):
//   • IDOR: another user's ids are refused by the *For services
//   • SSRF: Reach and free-model base URLs never reach internal addresses
//   • key hygiene: a provider error that echoes the key never lands in the DB
//   • OAuth pre-account-takeover: a squatter's password/2FA/sessions are evicted
//   • the shared (Postgres) rate limiter
// The only stand-in is `fetch` (tests have no network).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  calls: [] as string[],
  web: (() => null) as (url: string) => Response | null,
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const tokens = await import("@/lib/services/api-tokens");
const shorts = await import("@/lib/services/shorts");
const free = await import("@/lib/services/free-llm");
const voice = await import("@/lib/services/voice");
const reach = await import("@/lib/services/reach");
const { findOrCreateOAuthUser } = await import("@/lib/auth-oauth");
const { hitRateLimit } = await import("@/lib/rate-limit-db");
const { users, opsMissions, shortJobs, freeLlmKeys, voiceCommands, backupCodes } = schema;

let me = 0, sara = 0;

async function fakeFetch(input: RequestInfo | URL) {
  const url = String(input instanceof Request ? input.url : input);
  h.calls.push(url);
  return h.web(url) ?? new Response("not found", { status: 404 });
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test", emailVerified: new Date() }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test", emailVerified: new Date() }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("IDOR: another user's ids are refused", () => {
  it("API tokens: Sara can't revoke Ajdin's token", async () => {
    const { token, row } = await tokens.createApiTokenFor(me, "Claude Desktop");
    expect(await tokens.revokeApiTokenFor(sara, row.id)).toBe(false);
    expect(await tokens.verifyApiToken(token)).toMatchObject({ userId: me });
    // Only the hash is stored.
    const [stored] = await testDb.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, row.id));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(await tokens.revokeApiTokenFor(me, row.id)).toBe(true);
    expect(await tokens.verifyApiToken(token)).toBeNull();
  });

  it("missions: Sara can't cancel, accept or reopen Ajdin's", async () => {
    const m = await ops.createMissionFor(me, { title: "Find dentists in Mostar", kind: "research" }) as { id: number };
    const before = (await testDb.select().from(opsMissions).where(eq(opsMissions.id, m.id)))[0];
    await expect(ops.cancelMissionFor(sara, m.id)).rejects.toThrow(/not found/i);
    await expect(ops.acceptMissionFor(sara, m.id)).rejects.toThrow(/not found/i);
    await expect(ops.reopenMissionFor(sara, m.id, "x")).rejects.toThrow(/not found/i);
    const after = (await testDb.select().from(opsMissions).where(eq(opsMissions.id, m.id)))[0];
    expect(after.status).toBe(before.status);
  });

  it("shorts: Sara can't read, append to, retry or complete Ajdin's recording", async () => {
    const job = await shorts.createShortJobFor(me, { name: "voice.mp3", mime: "audio/mpeg", bytes: Buffer.from("ID3abc"), final: false });
    expect(await shorts.shortAudioFor(sara, job.id)).toBeNull();
    await expect(shorts.appendShortChunkFor(sara, job.id, Buffer.from("evil"), true)).rejects.toThrow();
    await expect(shorts.retryShortJobFor(sara, job.id)).rejects.toThrow();
    await shorts.completeShortJobFor(sara, job.id, { ok: true, results: [{ title: "pwned", file: "x", seconds: 1 }] });
    const [row] = await testDb.select().from(shortJobs).where(eq(shortJobs.id, job.id));
    expect(row).toMatchObject({ status: "uploading", audioBytes: 6 });
    expect(row.results ?? []).toEqual([]);
  });

  it("free-model keys: Sara can't remove or test Ajdin's", async () => {
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890abcdef", model: "llama-3.3-70b-versatile" });
    const [k] = await testDb.select().from(freeLlmKeys).where(eq(freeLlmKeys.userId, me));
    await free.removeFreeKeyFor(sara, k.id);
    await expect(free.testFreeKeyFor(sara, k.id)).rejects.toThrow(/not found/i);
    expect(await testDb.select().from(freeLlmKeys).where(eq(freeLlmKeys.id, k.id))).toHaveLength(1);
    expect((await free.freeStatusFor(sara)).providers).toEqual([]);
  });

  it("runner results: Sara's runner can't complete Ajdin's command", async () => {
    const [cmd] = await testDb.insert(voiceCommands).values({ userId: me, transcript: "add a task", status: "running", localDate: "2026-10-15", localTime: "09:00", timezone: "Europe/Sarajevo" }).returning();
    expect(await voice.completeFor(sara, cmd.id, { ok: true, summary: "hijacked" })).toBeNull();
    const [row] = await testDb.select().from(voiceCommands).where(eq(voiceCommands.id, cmd.id));
    expect(row).toMatchObject({ status: "running", summary: null });
  });
});

describe("SSRF", () => {
  it("Reach refuses internal addresses outright", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:9001/2018-06-01/runtime/invocation/next", "http://localhost:3000/api/admin/backup", "http://[::1]/", "http://2130706433/", "file:///etc/passwd"]) {
      h.calls = [];
      await expect(reach.reachRead(url)).rejects.toThrow();
      expect(h.calls).toEqual([]); // not even sent to the Jina/Exa fallbacks
    }
  });

  it("Reach never follows a redirect into the internal network", async () => {
    h.calls = [];
    h.web = (url) => url === "https://evil.example/" ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/iam/" } }) : null;
    await reach.reachRead("https://evil.example/").catch(() => null);
    expect(h.calls).toContain("https://evil.example/");
    expect(h.calls.some((u) => u.startsWith("http://169.254.169.254"))).toBe(false);
    h.web = () => null;
  });

  it("a free-model base URL must be public https", async () => {
    for (const baseUrl of ["https://127.0.0.1/v1", "https://localhost/v1", "https://10.0.0.8/v1", "https://[::1]/v1", "https://metadata.google.internal/v1", "http://api.example.com/v1"]) {
      await expect(free.saveFreeKeyFor(me, { provider: "custom", key: "sk-test-1234567890", model: "m", baseUrl })).rejects.toThrow(/https/);
    }
    await free.saveFreeKeyFor(me, { provider: "custom", key: "sk-test-1234567890", model: "m", baseUrl: "https://llm.example.com/v1" });
  });
});

describe("keys never leak into stored errors", () => {
  it("a provider that echoes the key back: the key is scrubbed from last_error and the thrown message", async () => {
    const key = "gsk_live_SuperSecretKey_0123456789";
    await free.saveFreeKeyFor(sara, { provider: "groq", key, model: "llama-3.3-70b-versatile" });
    h.web = (url) => url.endsWith("/chat/completions") ? new Response(JSON.stringify({ error: { message: `Invalid API Key: ${key}. Authorization: Bearer ${key}` } }), { status: 401 }) : null;
    const err = await free.askFree(sara, { system: "s", prompt: "p" }).catch((e: Error) => e);
    expect(String(err)).not.toContain("SuperSecretKey");
    const [row] = await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, sara), eq(freeLlmKeys.provider, "groq")));
    expect(row.lastError).toBeTruthy();
    expect(row.lastError).not.toContain("SuperSecretKey");
    expect(row.lastError).toContain("401");
    h.web = () => null;
  });
});

describe("OAuth sign-in vs. a squatted, unverified account", () => {
  it("evicts the squatter: password, 2FA, backup codes and sessions", async () => {
    const [squat] = await testDb.insert(users).values({
      name: "Not Faruk", email: "faruk@example.test", passwordHash: "$2b$10$squatterhash", twoFactorEnabled: true, twoFactorSecret: "SQUATTERSECRET", sessionVersion: 3,
    }).returning();
    await testDb.insert(backupCodes).values({ userId: squat.id, codeHash: "abc" });

    const id = await findOrCreateOAuthUser("Faruk@Example.test", "Faruk");
    expect(id).toBe(squat.id);
    const [u] = await testDb.select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ passwordHash: null, twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: 4 });
    expect(u.emailVerified).toBeInstanceOf(Date);
    expect(await testDb.select().from(backupCodes).where(eq(backupCodes.userId, id))).toEqual([]);
  });

  it("leaves a verified account with a password alone, and creates new users verified", async () => {
    await testDb.update(users).set({ passwordHash: "$2b$10$realhash", sessionVersion: 1 }).where(eq(users.id, me));
    expect(await findOrCreateOAuthUser("ajdin@example.test", "Ajdin")).toBe(me);
    const [u] = await testDb.select().from(users).where(eq(users.id, me));
    expect(u).toMatchObject({ passwordHash: "$2b$10$realhash", sessionVersion: 1 });

    const newId = await findOrCreateOAuthUser("new.person@example.test", null);
    const [n] = await testDb.select().from(users).where(eq(users.id, newId));
    expect(n).toMatchObject({ name: "new.person", passwordHash: null });
    expect(n.emailVerified).toBeInstanceOf(Date);
  });
});

describe("shared rate limiter", () => {
  it("counts per key across calls, refuses over the limit, and starts over after the window", async () => {
    const key = `login-email:test-${Date.now()}`;
    for (let i = 0; i < 3; i++) expect((await hitRateLimit(key, 3, 60_000)).allowed).toBe(true);
    const over = await hitRateLimit(key, 3, 60_000);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
    expect((await hitRateLimit(`${key}-other`, 3, 60_000)).allowed).toBe(true);

    await testDb.execute(sql`update rate_limits set reset_at = now() - interval '1 second' where key = ${key}`);
    expect((await hitRateLimit(key, 3, 60_000)).allowed).toBe(true);
  });
});
