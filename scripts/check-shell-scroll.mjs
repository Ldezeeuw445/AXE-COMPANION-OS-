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
  !contentShell.includes('"overflow-hidden"') ||
  !contentShell.includes(
    '"tos-app-content overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"',
  )
) {
  throw new Error("Normal app routes must scroll in ContentShell.");
}

if (settingsPage.includes("overflow-y-auto")) {
  throw new Error("Settings must not create a nested scroll container.");
}

if (!appChrome.includes("fixed inset-0")) {
  throw new Error("The app shell must be anchored to the viewport.");
}

if (
  !appChrome.includes("overflow-x-hidden") ||
  !appChrome.includes("[touch-action:pan-y]")
) {
  throw new Error(
    "The app shell must block horizontal viewport panning while preserving vertical gestures.",
  );
}

if (!swipeContentWrapper.includes("overflow-x-hidden")) {
  throw new Error("Swipe content must not widen the viewport.");
}

if (!chartCanvas.includes('touchAction: "none"')) {
  throw new Error("The chart canvas must retain its own drag gestures.");
}

console.log("Shell scroll contract is valid.");
