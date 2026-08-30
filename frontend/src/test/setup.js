import '@testing-library/jest-dom/vitest'

/*
 * jsdom does not implement these, and framer-motion / Radix-style components
 * call them during layout. Without the stubs, tests fail on environment gaps
 * rather than on the behaviour under test.
 */
globalThis.IntersectionObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}
