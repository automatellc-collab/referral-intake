import { afterEach, describe, expect, test, vi } from "vitest";
import { withViewTransition } from "./viewTransition";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error - test-only cleanup of a property we added to document
  delete document.startViewTransition;
});

describe("withViewTransition", () => {
  test("runs the update directly when the browser has no startViewTransition support", () => {
    // Arrange
    mockMatchMedia(false);
    const update = vi.fn();

    // Act
    withViewTransition(update);

    // Assert
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("runs the update directly when the user prefers reduced motion, even if transitions are supported", () => {
    // Arrange
    mockMatchMedia(true);
    document.startViewTransition = vi.fn();
    const update = vi.fn();

    // Act
    withViewTransition(update);

    // Assert
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  test("runs the update inside document.startViewTransition when supported and motion is allowed", () => {
    // Arrange
    mockMatchMedia(false);
    const update = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    });
    // @ts-expect-error - stubbing a browser API not present in jsdom
    document.startViewTransition = startViewTransition;

    // Act
    withViewTransition(update);

    // Assert
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("swallows a rejected transition instead of throwing an unhandled rejection", async () => {
    // Arrange
    mockMatchMedia(false);
    const update = vi.fn();
    // @ts-expect-error - stubbing a browser API not present in jsdom
    document.startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return { ready: Promise.reject(new Error("aborted")), finished: Promise.reject(new Error("aborted")) };
    });

    // Act
    const act = () => withViewTransition(update);

    // Assert
    expect(act).not.toThrow();
    // Let the swallowed promise rejections settle before the test exits.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
