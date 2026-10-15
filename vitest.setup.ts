import "@testing-library/jest-dom/vitest";
import { setSafeFetchLookup } from "@/lib/safe-fetch";

// Tests have no network (fetch is stubbed per test), so the SSRF guard's DNS
// check would fail on every name. Resolve every host name to a public
// documentation-style address instead; IP literals and internal names are
// still refused by the guard itself (see lib/safe-fetch.test.ts).
setSafeFetchLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

// jsdom doesn't implement IntersectionObserver — framer-motion's `whileInView`
// (used across the marketing page sections) needs at least a no-op stub.
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
