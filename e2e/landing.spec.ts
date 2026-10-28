import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "playwright/test";

const shotDir = process.env.LANDING_SHOT_DIR ?? join(process.cwd(), "e2e/artifacts");

test.describe("companion landing", () => {
  test("renders the restored Companion homepage and hides sample testimonials", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText("The trader's phone OS");
    await expect(page.getByText("Your Second Brain For Trading")).toBeVisible();
    await expect(page.getByText(/19 AXE intel feeds/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Execution discipline, from your fills." }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Try the live demo" }).first()).toHaveAttribute(
      "href",
      "#hero-devices",
    );
    await expect(page.getByText("Freya H.")).toHaveCount(0);
    await expect(page.getByText("Verified quotes")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: /^(Start|Get started)$/ })).toHaveAttribute(
      "href",
      "/signup",
    );
    await expect(page.getByRole("button", { name: /switch app/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose Pro" })).toHaveAttribute(
      "href",
      "/login?next=/upgrade",
    );
  });

  test("hero mock is a no-login walkthrough of the current app", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#hero-devices").scrollIntoViewIfNeeded();
    const phone = page.frameLocator('iframe[title*="iPhone"]').first();
    await expect(phone.getByText("NO LOGIN")).toBeVisible();
    await phone.getByRole("button", { name: "Chart" }).click();
    await expect(phone.getByText(/Demo candles/)).toBeVisible();
    await phone.getByRole("button", { name: "Account" }).click();
    await expect(phone.getByText("Resolved → Upcomers-Server")).toBeVisible();
    await phone.getByRole("button", { name: "Home" }).click();
    await phone.getByRole("button", { name: "Intel" }).click();
    await expect(phone.getByText("Not configured").first()).toBeVisible();
    await phone.getByRole("button", { name: "Home" }).click();
    await phone.getByRole("button", { name: "Price alerts" }).click();
    await expect(phone.getByText("Push notification delivery is not live")).toBeVisible();

    const ipad = page.frameLocator('iframe[title*="iPad"]').first();
    await expect(ipad.getByText("NO LOGIN")).toBeVisible();
    await ipad.getByRole("button", { name: "Intel" }).click();
    await expect(ipad.getByText("Not configured").first()).toBeVisible();
  });

  test("paid checkout starts on login with next=/upgrade", async ({ page }) => {
    await page.goto("/login?next=/upgrade", { waitUntil: "domcontentloaded" });
    const next = page.locator('input[name="next"]');
    if ((await next.count()) > 0) {
      await expect(next).toHaveValue("/upgrade");
    } else {
      await expect(page.getByText(/Supabase is not configured|Sign in|Create account/i).first()).toBeVisible();
    }
  });

  test("header actions stay on one line at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const login = page.getByRole("link", { name: "Log in" });
    const start = page.getByRole("link", { name: /^(Start|Get started)$/ });
    const loginBox = await login.boundingBox();
    const startBox = await start.boundingBox();
    expect(loginBox).toBeTruthy();
    expect(startBox).toBeTruthy();
    expect(Math.abs((loginBox?.y ?? 0) - (startBox?.y ?? 0))).toBeLessThan(6);
    expect((loginBox?.height ?? 40)).toBeLessThan(36);
  });

  test("captures phone and desktop screenshots including pricing", async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("nextjs-portal, #__next-build-watcher")).toHaveCount(0);
    await page.screenshot({
      path: join(shotDir, "landing-390x844.png"),
      fullPage: true,
    });
    await page.locator("#pricing").screenshot({
      path: join(shotDir, "landing-pricing-390x844.png"),
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(shotDir, "landing-1440x900.png"),
      fullPage: true,
    });
    await page.locator("#pricing").screenshot({
      path: join(shotDir, "landing-pricing-1440x900.png"),
    });
  });
});
