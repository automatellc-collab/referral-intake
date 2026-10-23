import { NextResponse } from "next/server";

/**
 * Best-effort usage logging: which grading factors get overridden, by what
 * source. No images or personal data are ever sent here — see lib/telemetry.ts.
 * Logged events are visible via `vercel logs` / the Vercel dashboard.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    console.log("[telemetry]", JSON.stringify({ event: body, receivedAt: new Date().toISOString() }));
  } catch {
    // malformed or empty payload — telemetry is best-effort, never fail the request
  }
  return NextResponse.json({ ok: true });
}
