import { NextResponse } from "next/server";

export const DEFAULT_USER_ID = "default";

/**
 * Lets multiple named strategy configs run side by side (e.g. "default" vs
 * a "video-literal" variant), each with independent settings, trades, and
 * daily stats — without building real multi-tenant auth. Pass a `profile`
 * query param or body field to address a non-default one; omit for the
 * existing single-profile behavior.
 */
export function resolveProfileId(profile: string | null | undefined): string {
  return profile && profile.trim() ? profile.trim() : DEFAULT_USER_ID;
}

/**
 * Single-user personal tool: there's no login system. When deployed
 * publicly (e.g. on Vercel), APP_ACCESS_TOKEN gates every API route behind
 * a shared secret passed as `Authorization: Bearer <token>`. If the env var
 * is unset, routes are open — fine for local-only use, not for a public URL.
 */
export function checkApiAuth(request: Request): NextResponse | null {
  const requiredToken = process.env.APP_ACCESS_TOKEN;
  if (!requiredToken) {
    return null;
  }

  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (provided !== requiredToken) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
