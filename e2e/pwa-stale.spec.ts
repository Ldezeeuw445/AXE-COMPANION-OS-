import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "playwright/test";

const shotDir = process.env.PWA_SHOT_DIR ?? join(process.cwd(), "e2e/artifacts");

test.describe("PWA C9 stale marks", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("quotes, account figures, cached candles, and SW prompt at 390x844", async ({
    page,
  }) => {
    mkdirSync(shotDir, { recursive: true });
    await page.goto("/marketing/pwa-probe", { waitUntil: "networkidle" });
    await expect(page.getByTestId("pwa-probe")).toBeVisible();

    await expect(page.getByTestId("sw-update-banner")).toContainText(
      "A new AXE version is ready. Reload to drop the stale bundle.",
    );

    const staleQuote = page.getByTestId("quote-stale-XAUUSD");
    await expect(staleQuote).toBeVisible();
    await expect(staleQuote).toHaveAttribute("data-freshness", "stale");
    await expect(page.getByTestId("quote-stale-EURUSD")).toHaveCount(0);

    await expect(page.getByTestId("pwa-probe-account-stale")).toBeVisible();
    await expect(page.getByTestId("pwa-probe-account-stale")).toContainText(/Stale/i);
    await expect(page.getByTestId("account-figures")).toContainText("10,400.00");

    await expect(page.getByTestId("chart-cache-stale")).toBeVisible();
    await expect(page.getByTestId("chart-cache-stale")).toHaveAttribute("data-freshness", /stale|offline/);

    await page.screenshot({
      path: join(shotDir, "pwa-c9-stale-390x844.png"),
      fullPage: false,
    });

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("quote-stale-XAUUSD")).toHaveAttribute("data-freshness", "offline");
    await expect(page.getByTestId("quote-stale-EURUSD")).toHaveAttribute("data-freshness", "offline");
    await expect(page.getByTestId("pwa-probe-account-stale")).toHaveAttribute("data-freshness", "offline");
    await page.screenshot({
      path: join(shotDir, "pwa-c9-offline-390x844.png"),
      fullPage: false,
    });
  });
});
