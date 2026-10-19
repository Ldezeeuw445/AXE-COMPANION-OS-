import { defineConfig, devices } from "playwright/test";

const port = Number(process.env.E2E_PORT ?? 5010);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "off",
  },
  webServer: {
    // Production server so screenshots never include the Next.js dev "N" badge.
    command: `npx next start -p ${port} -H 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
