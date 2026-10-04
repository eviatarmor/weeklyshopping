import { expect, test } from "@playwright/test";

// Desktop browser: top navbar instead of bottom tabs, multi-column grid, side panel drawers.
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test("desktop layout: top navbar, recipe page and side panel", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "dev_user", value: "alex@dev.local", url: baseURL! }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();

  const navbar = page.locator("header").first();
  await expect(navbar.getByText("Weekly Shopping")).toBeVisible();
  // The phone tab bar is hidden on desktop.
  await expect(page.locator("nav.fixed")).toBeHidden();

  await navbar.getByRole("link", { name: "Recipes" }).click();
  await page.getByPlaceholder(/Search .*recipes/).fill("Bengal Chickpea Curry");
  await page.getByRole("link", { name: /Bengal Chickpea Curry/ }).first().click();
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();

  await page.getByRole("button", { name: "Add to list" }).filter({ visible: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Already have any of these?")).toBeVisible();
  // Opens as a right-hand panel, not a bottom sheet.
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThan(700);
  expect(box!.height).toBeGreaterThan(800);
});
