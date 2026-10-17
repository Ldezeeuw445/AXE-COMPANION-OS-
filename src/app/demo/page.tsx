import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AXE Demo",
  description: "Demo entry for AXE Companion.",
  robots: { index: false, follow: false },
};

/**
 * This page used to create an anonymous Supabase session and drop the visitor
 * straight into the app. That is how 182 of 192 accounts on this project ended
 * up with no email and no way back in — see the note in /api/auth/demo.
 *
 * The link stays alive because it has been handed out, but it now leads to the
 * real door instead of a disposable one.
 */
export default async function DemoEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const resolved = await searchParams;
  const to = typeof resolved?.to === "string" && resolved.to.startsWith("/") ? resolved.to : null;
  redirect(to ? `/login?next=${encodeURIComponent(to)}` : "/login");
}
