import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isOwnedBlobUrl } from "@/lib/attachments";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { url } = (body as { url?: unknown } | null) ?? {};
  if (typeof url !== "string" || !isOwnedBlobUrl(url)) {
    return NextResponse.json({ error: "Invalid attachment URL." }, { status: 400 });
  }

  try {
    await del(url);
  } catch {
    // Best-effort cleanup: the user is done with this attachment either way,
    // and a failed delete just leaves an orphaned blob rather than breaking the UI.
  }

  return NextResponse.json({ ok: true });
}
