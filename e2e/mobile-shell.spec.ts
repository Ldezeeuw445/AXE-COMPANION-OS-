import { expect, test, type Page } from "playwright/test";

type ShellBox = {
  topbar: { x: number; y: number; width: number; height: number };
  nav: { x: number; y: number; width: number; height: number };
  shell: { x: number; y: number; width: number; height: number };
  viewport: string | null;
};

async function measureShell(page: Page): Promise<ShellBox> {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return { x: 0, y: 0, width: 0, height: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const shell = document.querySelector("[data-testid=mobile-shell]");
    return {
      topbar: box(document.querySelector("[data-testid=mobile-topbar]")),
      nav: box(document.querySelector("[data-testid=bottom-nav]")),
      shell: box(shell),
      viewport: shell?.getAttribute("data-shell-viewport") ?? null,
    };
  });
}

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("first phone render matches layout after a tab switch", async ({ page }) => {
    await page.goto("/marketing/shell-probe", { waitUntil: "networkidle" });
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toBeVisible();

    const first = await measureShell(page);
    expect(first.viewport).toBe("phone");
    expect(first.nav.width).toBeGreaterThan(200);
    expect(first.topbar.width).toBeGreaterThan(200);

    await page.getByTestId("shell-probe-other-tab").click();
    await expect(page.getByTestId("shell-probe")).toHaveAttribute("data-shell-probe-tab", "markets");
    await page.getByTestId("shell-probe-other-tab").click();
    await expect(page.getByTestId("shell-probe")).toHaveAttribute("data-shell-probe-tab", "home");

    const after = await measureShell(page);
    expect(after).toEqual(first);
  });

  test("active session survives reload", async ({ page }) => {
    await page.goto("/marketing/shell-probe", { waitUntil: "networkidle" });
    await page.getByTestId("shell-probe-set-session").click();
    await expect(page.getByTestId("shell-probe-session-json")).toContainText("EURUSD");
    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-symbol", "EURUSD");
    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-tf", "m15");
    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-account-type", "live");

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-symbol", "EURUSD");
    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-tf", "m15");
    await expect(page.getByTestId("mobile-shell")).toHaveAttribute("data-shell-account-type", "live");
    await expect(page.getByTestId("shell-probe-session-json")).toContainText("EURUSD");
  });
});
