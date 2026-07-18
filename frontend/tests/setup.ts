import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  if (!("PointerEvent" in window)) {
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true });
  }

  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: () => undefined, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { value: () => undefined, configurable: true });
  }
}

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
