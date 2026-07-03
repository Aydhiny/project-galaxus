import "@testing-library/jest-dom/vitest";

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
