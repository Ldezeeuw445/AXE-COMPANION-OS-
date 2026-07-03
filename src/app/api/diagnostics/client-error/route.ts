import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.error("[client-error] Received client error:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("[client-error] Failed to parse body", err);
  }
  return NextResponse.json({ ok: true });
}
