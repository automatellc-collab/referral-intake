export interface TelemetryFactorEvent {
  factor: "corners" | "edges" | "surface";
  heuristicSeverity: string;
  heuristicValue: number;
  overridden: boolean;
  overrideSource?: "manual" | "ai";
}

export type TelemetryEvent =
  | { type: "grade_completed"; factors: TelemetryFactorEvent[] }
  | { type: "ai_surface_override_applied"; score: number };

/**
 * Fire-and-forget usage event — no images, no personal data, just abstract
 * grading stats (which factors got overridden, by what source) so override
 * rates can be checked against real tester usage instead of guesswork.
 * Never throws; a telemetry failure must never affect the grading flow.
 */
export function sendTelemetry(event: TelemetryEvent): void {
  try {
    const body = JSON.stringify(event);
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // telemetry must never break the grading flow
  }
}
