// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BlockedUrlError, assertPublicUrl, checkUrl, isPrivateAddress, isPublicUrl, readTextCapped, safeFetch, type LookupFn } from "./safe-fetch";

const PUBLIC = "93.184.216.34";
const resolveTo = (map: Record<string, string[]>): LookupFn => async (host) => {
  const ips = map[host];
  if (!ips) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "169.254.170.2", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::127.0.0.1",
    "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "64:ff9b:1::1", "2002:7f00:1::", "2002:c0a8:101::1", "2001:db8::1", "2001:0:4136:e378::1",
    "not-an-ip", "1.2.3", "256.1.1.1",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", PUBLIC, "172.15.255.255", "172.32.0.1", "100.63.255.255", "192.169.0.1", "2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"])(
    "allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false)
  );
});

describe("checkUrl (no DNS)", () => {
  it.each([
    "http://127.0.0.1/", "http://localhost:3000/", "http://LOCALHOST./", "http://foo.localhost/", "http://printer.local/",
    "http://metadata.google.internal/computeMetadata/v1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://[fe80::1]/", "http://intranet/", "http://0/",
    // Numeric tricks: the URL parser turns all of these into 127.0.0.1 / 10.0.0.1 before we look.
    "http://2130706433/", "http://0x7f000001/", "http://0x7f.0.0.1/", "http://0177.0.0.1/", "http://017700000001/", "http://127.1/", "http://10.1/",
    "file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "data:text/html,hi",
    "https://user:pass@example.com/", "not a url",
  ])("blocks %s", (url) => expect(() => checkUrl(url)).toThrow(BlockedUrlError));

  it("allows ordinary public sites, and httpsOnly refuses plain http", () => {
    expect(checkUrl("https://example.com/a?b=1").hostname).toBe("example.com");
    expect(isPublicUrl("http://zubar.ba/kontakt")).toBe(true);
    expect(isPublicUrl("http://8.8.8.8/")).toBe(true);
    expect(isPublicUrl("http://zubar.ba/", { httpsOnly: true })).toBe(false);
  });
});

describe("assertPublicUrl (DNS)", () => {
  it("refuses a public-looking name that resolves to a private address (or to a mix)", async () => {
    const lookup = resolveTo({ "evil.example": ["127.0.0.1"], "mixed.example": [PUBLIC, "10.0.0.5"], "v6.example": ["::1"], "ok.example": [PUBLIC] });
    await expect(assertPublicUrl("https://evil.example/", { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicUrl("https://mixed.example/", { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicUrl("https://v6.example/", { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicUrl("https://nowhere.example/", { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicUrl("https://ok.example/x", { lookup })).resolves.toBeInstanceOf(URL);
  });
});

describe("safeFetch", () => {
  const lookup = resolveTo({ "site.example": [PUBLIC], "other.example": [PUBLIC], "rebind.example": ["10.0.0.7"] });

  function server(routes: Record<string, () => Response>) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      expect(init.redirect).toBe("manual"); // we follow redirects ourselves, checking each hop
      const r = routes[url];
      return r ? r() : new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }
  const redirect = (to: string, status = 302) => () => new Response(null, { status, headers: { location: to } });

  it("follows a redirect to another public page", async () => {
    const s = server({ "https://site.example/": redirect("/home"), "https://site.example/home": () => new Response("hello") });
    const res = await safeFetch("https://site.example/", {}, { lookup, fetchImpl: s.fetchImpl });
    expect(await res.text()).toBe("hello");
    expect(s.calls.map((c) => c.url)).toEqual(["https://site.example/", "https://site.example/home"]);
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/iam/",
    "http://127.0.0.1:9001/2018-06-01/runtime/invocation/next",
    "http://[::ffff:7f00:1]/",
    "http://2130706433/",
    "https://rebind.example/",
    "http://localhost/admin",
  ])("refuses a redirect into %s", async (to) => {
    const s = server({ "https://site.example/": redirect(to) });
    await expect(safeFetch("https://site.example/", {}, { lookup, fetchImpl: s.fetchImpl })).rejects.toThrow(BlockedUrlError);
    expect(s.calls).toHaveLength(1); // the internal address was never requested
  });

  it("refuses a private target before sending anything", async () => {
    const s = server({});
    await expect(safeFetch("http://10.0.0.1/", {}, { lookup, fetchImpl: s.fetchImpl })).rejects.toThrow(BlockedUrlError);
    await expect(safeFetch("https://rebind.example/", {}, { lookup, fetchImpl: s.fetchImpl })).rejects.toThrow(BlockedUrlError);
    expect(s.calls).toHaveLength(0);
  });

  it("stops redirect loops", async () => {
    const s = server({ "https://site.example/a": redirect("/b"), "https://site.example/b": redirect("/a") });
    await expect(safeFetch("https://site.example/a", {}, { lookup, fetchImpl: s.fetchImpl, maxRedirects: 3 })).rejects.toThrow(/Too many redirects/);
    expect(s.calls).toHaveLength(4);
  });

  it("drops the API key when a redirect leaves the origin, and turns a 303 POST into a GET", async () => {
    const s = server({
      "https://site.example/v1/chat": redirect("https://other.example/collect", 303),
      "https://other.example/collect": () => new Response("{}"),
    });
    await safeFetch("https://site.example/v1/chat", { method: "POST", body: "{}", headers: { Authorization: "Bearer sk-secret", "content-type": "application/json" } }, { lookup, fetchImpl: s.fetchImpl });
    const [first, second] = s.calls;
    expect(new Headers(first.init.headers).get("authorization")).toBe("Bearer sk-secret");
    expect(new Headers(second.init.headers).get("authorization")).toBeNull();
    expect(second.init.method).toBe("GET");
    expect(second.init.body).toBeUndefined();
  });

  it("keeps the method, body and key on a same-origin 307", async () => {
    const s = server({ "https://site.example/a": redirect("/b", 307), "https://site.example/b": () => new Response("ok") });
    await safeFetch("https://site.example/a", { method: "POST", body: "x", headers: { Authorization: "Bearer k" } }, { lookup, fetchImpl: s.fetchImpl });
    expect(s.calls[1].init).toMatchObject({ method: "POST", body: "x" });
    expect(new Headers(s.calls[1].init.headers).get("authorization")).toBe("Bearer k");
  });
});

describe("readTextCapped", () => {
  it("stops reading at the cap", async () => {
    const big = new Response(new ReadableStream({
      pull(c) { c.enqueue(new TextEncoder().encode("a".repeat(1000))); }, // never ends
    }));
    const text = await readTextCapped(big, 2500);
    expect(text.length).toBe(2500);
  });
});
