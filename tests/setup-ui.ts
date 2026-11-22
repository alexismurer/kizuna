import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; layouts that measure themselves only need it to exist
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
