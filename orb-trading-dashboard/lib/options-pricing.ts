/**
 * Standard Black-Scholes European option pricing. Used only for retrospective
 * "what if I'd traded options instead of shares" estimates — this is a
 * theoretical model, not real market quotes (no bid/ask spread, skew, or
 * liquidity effects). Real option premiums will differ from this.
 */

// Abramowitz & Stegun 7.1.26 approximation of the error function (max error ~1.5e-7).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

interface D1D2 {
  d1: number;
  d2: number;
}

function computeD1D2(S: number, K: number, T: number, r: number, sigma: number): D1D2 {
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * @param S underlying price
 * @param K strike price
 * @param T time to expiration, in years
 * @param r risk-free rate (annualized, e.g. 0.04 for 4%)
 * @param sigma implied volatility (annualized, e.g. 0.15 for 15%)
 */
export function blackScholesCall(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) {
    return Math.max(0, S - K);
  }
  const { d1, d2 } = computeD1D2(S, K, T, r, sigma);
  return S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
}

export function blackScholesPut(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) {
    return Math.max(0, K - S);
  }
  const { d1, d2 } = computeD1D2(S, K, T, r, sigma);
  return K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
}
