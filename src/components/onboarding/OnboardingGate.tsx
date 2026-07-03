"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const SKIP_PREFIXES = ["/onboarding", "/login", "/welcome", "/marketing", "/legal", "/demo/embed"];

/** Redirect first-time users to smart onboarding. */
export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!pathname || SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { completed?: boolean };
        if (!json.completed && !cancelled) {
          router.replace("/onboarding");
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!checked) return null;
  return null;
}
