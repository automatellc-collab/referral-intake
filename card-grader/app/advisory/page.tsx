"use client";

import { useMemo, useState } from "react";

interface ServiceRow {
  name: string;
  turnaround: string;
  cost: string;
}

const SERVICES: ServiceRow[] = [
  { name: "PSA", turnaround: "Economy → Super Express tiers (weeks to a few days)", cost: "$$ – $$$$" },
  { name: "BGS (Beckett)", turnaround: "Standard → Super Express tiers", cost: "$$ – $$$$" },
  { name: "SGC", turnaround: "Standard → Express tiers", cost: "$ – $$$" },
];

export default function AdvisoryPage() {
  const [rawValue, setRawValue] = useState("");
  const [gradedValue, setGradedValue] = useState("");
  const [fee, setFee] = useState("25");
  const [shipping, setShipping] = useState("15");

  const result = useMemo(() => {
    const raw = parseFloat(rawValue) || 0;
    const graded = parseFloat(gradedValue) || 0;
    const feeAmount = parseFloat(fee) || 0;
    const shippingAmount = parseFloat(shipping) || 0;
    const breakeven = raw + feeAmount + shippingAmount;
    const netGain = graded - breakeven;
    return { breakeven, netGain, worthIt: netGain > 0 };
  }, [rawValue, gradedValue, fee, shipping]);

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Submission advisor</h1>

      <section className="w-full max-w-2xl">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          PSA vs. BGS vs. SGC — approximate comparison
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Illustrative only — turnaround and pricing tiers change frequently. Check each service&apos;s
          current published rates before submitting.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Turnaround tiers</th>
                <th className="px-4 py-2">Relative cost</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((service) => (
                <tr key={service.name} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">{service.name}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{service.turnaround}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{service.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="w-full max-w-md">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Is it worth submitting?
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Current raw (ungraded) value estimate ($)
            <input
              type="number"
              inputMode="decimal"
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Estimated value if graded ($)
            <input
              type="number"
              inputMode="decimal"
              value={gradedValue}
              onChange={(e) => setGradedValue(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Grading fee ($)
              <input
                type="number"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Shipping + insurance ($)
              <input
                type="number"
                inputMode="decimal"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              result.worthIt
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            <p className="font-medium">{result.worthIt ? "Likely worth submitting" : "Probably not worth it yet"}</p>
            <p className="mt-1 text-xs opacity-80">
              Breakeven graded value: ${result.breakeven.toFixed(2)} · Net gain at your estimate: $
              {result.netGain.toFixed(2)}
            </p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Based entirely on the numbers you enter above — not a market appraisal.
          </p>
        </div>
      </section>
    </div>
  );
}
