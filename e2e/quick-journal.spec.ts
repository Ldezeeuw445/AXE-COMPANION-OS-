import { expect, test } from "playwright/test";

test.describe("quick journal", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens a prefilled sheet from a closed trade in one tap", async ({ page }) => {
    await page.goto("/marketing/journal-probe", { waitUntil: "networkidle" });
    await expect(page.getByTestId("journal-probe")).toBeVisible();

    await page.getByTestId("journal-probe-open").click();

    const sheet = page.getByTestId("quick-journal-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("quick-journal-symbol")).toHaveText("XAUUSD");
    await expect(page.getByTestId("quick-journal-direction")).toHaveText("Sell");
    await expect(page.getByTestId("quick-journal-entry")).toContainText("2651");
    await expect(page.getByTestId("quick-journal-exit")).toContainText("2644");
    await expect(page.getByTestId("quick-journal-pnl")).toContainText("62.60");
    await expect(page.getByTestId("quick-journal-account")).toContainText("Probe Live");
    await expect(page.getByTestId("quick-journal-axe-draft")).toContainText("Held the plan");

    await page.getByTestId("quick-journal-note").fill("Cut at the reclaim.");
    await page.getByTestId("quick-journal-save").click();
    await expect(sheet).toBeHidden({ timeout: 8_000 });
  });
});
