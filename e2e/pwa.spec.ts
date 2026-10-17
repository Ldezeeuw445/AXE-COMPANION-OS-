import { expect, test } from "playwright/test";

test.describe("PWA install surface", () => {
  test("manifest is installable (name, standalone, maskable 192/512)", async ({
    request,
  }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBe("AXE Companion");
    expect(manifest.start_url).toBe("/chat");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#06070a");

    const icons = manifest.icons as Array<{ sizes: string; purpose?: string; src: string }>;
    const purposes = (sizes: string) =>
      icons
        .filter((icon) => icon.sizes === sizes)
        .flatMap((icon) => (icon.purpose ?? "any").split(/\s+/));
    expect(purposes("192x192")).toContain("any");
    expect(purposes("192x192")).toContain("maskable");
    expect(purposes("512x512")).toContain("any");
    expect(purposes("512x512")).toContain("maskable");

    for (const icon of icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.ok(), icon.src).toBeTruthy();
    }
  });

  test("landing HTML has iOS standalone + theme-color + apple-touch-icon", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const capable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    const mobileCapable = page.locator('meta[name="mobile-web-app-capable"]');
    await expect(capable.or(mobileCapable).first()).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#06070a",
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      /apple-touch-icon/,
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.json/,
    );
  });

  test("offline fallback page renders", async ({ page }) => {
    await page.goto("/offline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
  });

  test("service worker is not cached and implements last-viewed + update flow", async ({
    request,
  }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    const cacheControl = res.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/no-cache|no-store/i);
    const body = await res.text();
    expect(body).toContain('addEventListener("fetch"');
    expect(body).toContain("/offline");
    expect(body).toContain("CACHE_LAST_VIEWED");
    expect(body).toContain("SKIP_WAITING");
    expect(body).toContain("AXE_PUSH_OPEN");
    expect(body).toContain('addEventListener("notificationclick"');
    expect(body).toContain("/api/feed");
    expect(body).toContain("self.skipWaiting()");
    expect(body).not.toMatch(/addEventListener\(\s*"install"[\s\S]{0,400}skipWaiting/);
  });
});
