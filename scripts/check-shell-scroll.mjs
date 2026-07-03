import { readFile } from "node:fs/promises";

const contentShell = await readFile(
  new URL("../src/components/shell/ContentShell.tsx", import.meta.url),
  "utf8",
);
const settingsPage = await readFile(
  new URL("../src/app/(app)/settings/page.tsx", import.meta.url),
  "utf8",
);
const appChrome = await readFile(
  new URL("../src/components/shell/AppChrome.tsx", import.meta.url),
  "utf8",
);
const swipeContentWrapper = await readFile(
  new URL("../src/components/shell/SwipeContentWrapper.tsx", import.meta.url),
  "utf8",
);
const chartCanvas = await readFile(
  new URL("../src/components/chart/ChartCanvas.tsx", import.meta.url),
  "utf8",
);

if (
  !contentShell.includes('"overflow-hidden pb-[var(--tos-nav-offset)] md:pb-0"') ||
  !contentShell.includes("tos-app-content") ||
  !contentShell.includes("overflow-y-auto")
) {
  throw new Error("Normal app routes must scroll in ContentShell.");
}

if (settingsPage.includes("overflow-y-auto")) {
  throw new Error("Settings must not create a nested scroll container.");
}

if (!appChrome.includes("min-h-dvh")) {
  throw new Error("The app shell must keep natural document flow with min-h-dvh.");
}

if (
  !appChrome.includes("<ClientBottomNav />") ||
  !appChrome.includes("[touch-action:pan-y]")
) {
  throw new Error(
    "The app shell must keep touch-action guard and render the mobile bottom nav.",
  );
}

if (!swipeContentWrapper.includes("overflow-x-hidden")) {
  throw new Error("Swipe content must not widen the viewport.");
}

if (!chartCanvas.includes('touchAction: "none"')) {
  throw new Error("The chart canvas must retain its own drag gestures.");
}

console.log("Shell scroll contract is valid.");
