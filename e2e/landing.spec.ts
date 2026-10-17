import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "playwright/test";

const shotDir = process.env.LANDING_SHOT_DIR ?? join(process.cwd(), "e2e/artifacts");

test.describe("companion landing", () => {
  test("renders the new homepage and hides sample testimonials", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText("your intelligence");
    await expect(page.getByText("Same stack · two surfaces")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The brain behind every decision." })).toBeVisible();
    await expect(page.getByText("Example — sample cockpit, not live data")).toBeVisible();
    await expect(page.getByText("Freya H.")).toHaveCount(0);
    await expect(page.getByText("Verified quotes")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("button", { name: /switch app/i })).toBeVisible();
  });

  test("captures phone and desktop screenshots", async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(shotDir, "landing-390x844.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(shotDir, "landing-1440x900.png"),
      fullPage: true,
    });
  });
});
