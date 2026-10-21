import { expect, test } from "playwright/test";

test.describe("broker connect support check", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows known, unknown and unsupported before any login is typed", async ({ page }) => {
    const credentialPosts: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      const body = req.postData() ?? "";
      if (req.method() === "POST" && /mt5Password|investorPassword|password=/i.test(`${url}\n${body}`)) {
        credentialPosts.push(body.slice(0, 200));
      }
    });

    await page.goto("/marketing/broker-connect-probe", { waitUntil: "networkidle" });
    await expect(page.getByTestId("broker-connect-probe")).toBeVisible();
    await expect(page.getByTestId("broker-connect")).toBeVisible();

    const server = page.getByTestId("broker-connect-server");
    await expect(server).toBeVisible();
    await expect(page.getByTestId("broker-support-popular")).toBeVisible();
    await expect(page.locator("#wiz-login")).toHaveCount(0);
    await expect(page.locator("#wiz-password")).toHaveCount(0);

    await page.getByTestId("broker-suggestion-icmarkets").click();
    await expect(page.getByTestId("broker-support-status")).toHaveAttribute("data-kind", "known");
    await expect(page.getByTestId("broker-support-title")).toHaveText("Known broker — supported");
    await expect(page.getByTestId("broker-support-explanation")).toContainText("nothing is sent until you press Connect");
    await expect(page.getByTestId("broker-connect-next")).toBeEnabled();

    await server.fill("WhiteLabelProp-Live");
    await expect(page.getByTestId("broker-support-status")).toHaveAttribute("data-kind", "unknown");
    await expect(page.getByTestId("broker-support-title")).toHaveText("Unknown — may still work");
    await expect(page.getByTestId("broker-connect-next")).toBeEnabled();

    await server.fill("cTrader");
    await expect(page.getByTestId("broker-support-status")).toHaveAttribute("data-kind", "unsupported");
    await expect(page.getByTestId("broker-support-title")).toHaveText("Not supported");
    await expect(page.getByTestId("broker-connect-next")).toBeDisabled();

    await expect(page.getByTestId("broker-connect-submit")).toHaveCount(0);
    expect(credentialPosts, "no credential left this page before Connect").toEqual([]);
  });
});
