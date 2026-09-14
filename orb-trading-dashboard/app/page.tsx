const BUILT_MODULES = [
  { name: "Opening range detection", path: "lib/orb-strategy.ts", status: "done" as const },
  { name: "Breakout detection (bullish/bearish)", path: "lib/orb-strategy.ts", status: "done" as const },
  { name: "Retest + rejection candle entry", path: "lib/orb-strategy.ts", status: "done" as const },
  { name: "Fibonacci retracement entry (0.236–0.382)", path: "lib/fibonacci.ts", status: "done" as const },
  { name: "Market hours / ET session window", path: "lib/market-hours.ts", status: "done" as const },
  { name: "Daily loss limit + circuit breaker", path: "lib/risk-calculator.ts", status: "done" as const },
  { name: "Position sizing with max-order cap", path: "lib/risk-calculator.ts", status: "done" as const },
];

const REMAINING_MODULES = [
  "Robinhood MCP client wrapper (lib/robinhood-client.ts)",
  "Live market data hook + WebSocket/polling",
  "Price chart with Fibonacci + opening range overlay",
  "Trade execution API routes (all 3 modes)",
  "Position manager + database persistence",
  "Settings UI (mode, risk %, symbols, loss limit)",
  "Backtesting engine",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          ORB Trading Dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Opening Range Breakout strategy engine — core logic implemented and
          tested. UI, live data, and trade execution are still in progress.
        </p>

        <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>Paper trading is the default mode.</strong> Automated
          execution against a real account requires explicit opt-in and
          respects the daily loss limit and max-order-size caps configured in{" "}
          <code>types/trading.ts</code>.
        </div>

        <h2 className="mt-10 text-lg font-medium text-black dark:text-zinc-50">
          Core strategy engine (tested)
        </h2>
        <ul className="mt-3 space-y-2">
          {BUILT_MODULES.map((m) => (
            <li
              key={m.path + m.name}
              className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="text-zinc-800 dark:text-zinc-200">{m.name}</span>
              <code className="text-xs text-zinc-500 dark:text-zinc-500">{m.path}</code>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-lg font-medium text-black dark:text-zinc-50">
          Remaining work
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {REMAINING_MODULES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-zinc-500 dark:text-zinc-500">
          Run <code>npm test</code> to verify the strategy engine.
        </p>
      </main>
    </div>
  );
}
