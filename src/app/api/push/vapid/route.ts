import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/env";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }
  return NextResponse.json({ publicKey });
}
