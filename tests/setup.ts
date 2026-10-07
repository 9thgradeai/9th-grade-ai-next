/// <reference types="vitest" />
import "@testing-library/jest-dom";

// jsdom in this Vitest setup does not expose a functional Storage; install a
// minimal in-memory polyfill so components using localStorage (e.g. exam
// state persistence) work reliably in tests.
// A functional matchMedia is also absent; framer-motion's useReducedMotion
// reads it, so stub a no-preference implementation.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
// framer-motion's `whileInView` requires an IntersectionObserver; jsdom does
// not ship one, so install a no-op stub to keep viewport-triggered animations
// harmless in tests.
if (typeof globalThis.IntersectionObserver === "undefined") {
  (globalThis as any).IntersectionObserver = class {
    readonly root: Element | Document | null = null;
    readonly rootMargin = "0px";
    readonly thresholds: ReadonlyArray<number> = [0];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };
}
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.clear !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
}

(globalThis as any).process = {
  ...(globalThis as any).process,
  listeners: (globalThis as any).process?.listeners?.bind(globalThis.process) ?? (() => []),
  env: {
    ...(globalThis as any).process?.env,
    AUTH_SECRET: (globalThis as any).process?.env?.AUTH_SECRET ?? "test-secret-key-for-unit-tests-only",
    NODE_ENV: (globalThis as any).process?.env?.NODE_ENV ?? "test",
  },
};

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: "" }),
  }),
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(""),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => "/"),
  useSegments: vi.fn(() => []),
}));
vi.mock("~backend/db", () => {
  // Stable deep-mock: every model delegate resolves to the SAME cached
  // vi.fn per path, so `vi.mocked(prisma.user.findUnique).mockResolvedValue`
  // works in any test without hand-maintaining a 300-line method inventory.
  // Unconfigured methods resolve undefined (await-safe). `$transaction` etc.
  // are plain fns — tests override per-case via mockImplementation.
  const cache = new Map<string, unknown>();
  const atPath = (path: string): unknown => {
    let node = cache.get(path);
    if (!node) {
      const fn = vi.fn((..._args: unknown[]) => undefined);
      node = new Proxy(fn, {
        get(t, prop) {
          // Mock controls (mockResolvedValue, mock.calls, …) live on the
          // underlying vi.fn — forward them so `vi.mocked(...)` works.
          // Anything else (model delegates, methods) is a deeper mock node.
          if (typeof prop === "string" && cache.has(`${path}.${prop}`)) {
            return cache.get(`${path}.${prop}`);
          }
          if (prop in t) return (t as unknown as Record<string | symbol, unknown>)[prop];
          return atPath(`${path}.${String(prop)}`);
        },
        apply(t, thisArg, args) {
          // Call through to the underlying vi.fn so per-test
          // mockResolvedValue/mockImplementation take effect (including
          // tagged-template calls like prisma.$queryRaw`...`).
          return Reflect.apply(t as unknown as (...a: unknown[]) => unknown, thisArg, args);
        },
        // Descriptor traps so `vi.spyOn(prisma, "$queryRaw")` sees and can
        // replace mock nodes like on a plain object.
        has(t, prop) {
          if (typeof prop === "string") return true;
          return prop in t;
        },
        getOwnPropertyDescriptor(t, prop) {
          if (typeof prop === "string" && cache.has(`${path}.${prop}`)) {
            return {
              configurable: true,
              enumerable: true,
              writable: true,
              value: cache.get(`${path}.${prop}`),
            };
          }
          return Reflect.getOwnPropertyDescriptor(t, prop);
        },
        defineProperty(_t, prop, descriptor) {
          cache.set(`${path}.${String(prop)}`, (descriptor as PropertyDescriptor).value);
          return true;
        },
        set(_t, prop, value) {
          cache.set(`${path}.${String(prop)}`, value);
          return true;
        },
      });
      cache.set(path, node);
    }
    return node;
  };
  return { prisma: atPath("prisma") };
});
