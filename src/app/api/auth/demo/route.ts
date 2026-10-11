import { NextResponse } from "next/server";

/**
 * Anonymous demo sessions are gone, on purpose.
 *
 * Measured 2026-10-11: 182 of 192 accounts on this project were anonymous, and
 * 175 users had a broker account attached. An anonymous account has no email,
 * so the moment someone clears their browser or picks up another phone, their
 * journal, their RAG files and their learning arc are unreachable — by them and
 * by us. There is no password reset for an account with nothing to reset. You
 * cannot charge twenty euros a month for data that lives in one browser
 * session.
 *
 * The old shared-credentials fallback is gone with it, and that one was worse:
 * every visitor signed into the SAME user, so each demo visitor could read the
 * previous visitor's chats and trades. A privacy incident waiting for a busy
 * day.
 *
 * The product intent — let someone try AXE before paying — is good and should
 * come back as a real sign-up with a time-boxed Pro trial. The entitlement
 * shape for that already exists (plan "free" with a future `pro_until`, which
 * expires on its own). What it needs is an account with an email on it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Demo sessions now need a real account. Sign up with an email — your journal, memory and settings stay yours across devices.",
      signupUrl: "/login",
    },
    { status: 410 },
  );
}

export async function DELETE() {
  // Kept so an old client that still calls this on sign-out does not error.
  return NextResponse.json({ ok: true });
}
