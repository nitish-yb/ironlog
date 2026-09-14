import { expect, test } from "@playwright/test";

test("seeded routine can start and recover", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("4 routines")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).first().click();
  await expect(page.getByRole("heading", { name: "Sample Push" })).toBeVisible();
  await page.getByLabel("Barbell bench press set 1 weight").fill("20");
  await page.getByLabel("Complete set").first().click();
  await expect(page.getByText("Rest")).toBeVisible();
  await page.reload();
  await expect(page.locator('input[value="20"]')).toBeVisible();
});
