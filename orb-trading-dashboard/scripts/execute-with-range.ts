#!/usr/bin/env npx tsx

/**
 * Execute ORB signal check with manual opening range override.
 * Usage: npx tsx scripts/execute-with-range.ts <symbol> <high> <low> [profile]
 * Example: npx tsx scripts/execute-with-range.ts SPY 764.39 763.23 video-literal
 */

const [, , symbol, highStr, lowStr, profile = "default"] = process.argv;

if (!symbol || !highStr || !lowStr) {
  console.error(
    "Usage: npx tsx scripts/execute-with-range.ts <symbol> <high> <low> [profile]",
  );
  console.error("Example: npx tsx scripts/execute-with-range.ts SPY 764.39 763.23 video-literal");
  process.exit(1);
}

const high = parseFloat(highStr);
const low = parseFloat(lowStr);

if (isNaN(high) || isNaN(low)) {
  console.error("Error: high and low must be valid numbers");
  process.exit(1);
}

if (high <= low) {
  console.error("Error: high must be greater than low");
  process.exit(1);
}

const payload = {
  symbol,
  accountEquity: 10000,
  profile,
  overrideOpeningRange: { high, low },
};

console.log(`[ORB] Executing ${symbol} with manual range: HIGH ${high}, LOW ${low}`);
console.log(`[ORB] Payload:`, JSON.stringify(payload, null, 2));

fetch("http://localhost:3300/api/trading/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
})
  .then((res) => res.json())
  .then((data) => {
    console.log("[ORB] Response:", JSON.stringify(data, null, 2));
    if (data.data?.status === "ALERTED") {
      console.log(
        `[ORB] Signal: ${data.data.reason}`,
      );
    }
  })
  .catch((err) => {
    console.error("[ORB] Error:", err);
    process.exit(1);
  });
