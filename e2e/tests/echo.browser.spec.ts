import { expect, test } from "@playwright/test";

test(
  "navigates to the echo endpoint in Chromium",
  { tag: ["@smoke", "@browser"] },
  async ({ page }): Promise<void> => {
    const response = await page.goto("/echo?source=chromium");

    expect(response?.ok()).toBe(true);
    await expect(page.locator("body")).toContainText('"method":"GET"');
    await expect(page.locator("body")).toContainText('"source":"chromium"');
  },
);
