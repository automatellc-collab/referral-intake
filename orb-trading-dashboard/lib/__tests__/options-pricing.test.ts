import { describe, expect, test } from "vitest";
import { blackScholesCall, blackScholesPut } from "@/lib/options-pricing";

describe("blackScholesCall / blackScholesPut", () => {
  // Classic reference values (Hull, "Options, Futures, and Other Derivatives"):
  // S=100, K=100, T=1yr, r=5%, sigma=20% -> call ~10.45, put ~5.57
  test("matches the standard textbook reference case", () => {
    expect(blackScholesCall(100, 100, 1, 0.05, 0.2)).toBeCloseTo(10.45, 1);
    expect(blackScholesPut(100, 100, 1, 0.05, 0.2)).toBeCloseTo(5.57, 1);
  });

  test("call price approaches intrinsic value as time to expiry shrinks to near zero", () => {
    const deepItmCall = blackScholesCall(110, 100, 0.0001, 0.05, 0.2);
    expect(deepItmCall).toBeCloseTo(10, 0);
  });

  test("out-of-the-money option approaches zero as time to expiry shrinks", () => {
    const otmCall = blackScholesCall(95, 100, 0.0001, 0.05, 0.2);
    expect(otmCall).toBeLessThan(0.5);
  });

  test("put-call parity holds: C - P = S - K*e^(-rT)", () => {
    const S = 105, K = 100, T = 0.1, r = 0.04, sigma = 0.15;
    const call = blackScholesCall(S, K, T, r, sigma);
    const put = blackScholesPut(S, K, T, r, sigma);
    expect(call - put).toBeCloseTo(S - K * Math.exp(-r * T), 5);
  });
});
