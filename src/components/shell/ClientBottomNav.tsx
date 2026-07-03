"use client";

/**
 * ClientBottomNav — thin wrapper that simply renders the BottomNav
 * as a client component. No dynamic import or ssr:false — the nav
 * renders identically on server and client, preventing any height
 * flash on first load.
 */

import { BottomNav } from "@/components/shell/BottomNav";

export function ClientBottomNav() {
  return <BottomNav />;
}
