"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** False during SSR, true after hydration. Replaces mount-only `setMounted(true)`. */
export function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
