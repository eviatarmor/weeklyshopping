import { expect, test, type Browser, type Page } from "@playwright/test";

async function openAs(browser: Browser, email: string, baseURL: string, path = "/"): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "dev_user", value: email, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("html[data-sync=pending]")).toBeAttached({ timeout: 30_000 });
  return page;
}

test("dinners planned on one phone show up on the other, and can go onto the list", async ({ browser, baseURL }) => {
  // A week far in the future so runs don't collide with real plans.
  const week = "2030-01-07";
  const alex = await openAs(browser, "alex@dev.local", baseURL!, `/week?w=${week}`);
  const sam = await openAs(browser, "sam@dev.local", baseURL!, `/week?w=${week}`);
  const custom = `Pizza night ${Date.now()}`;

  // A dinner with just a name.
  await alex.getByRole("button", { name: "Add dinner on Friday" }).click();
  await alex.getByPlaceholder("Search recipes or type any dinner").fill(custom);
  await alex.getByRole("button", { name: `Add "${custom}"` }).click();
  await expect(sam.getByText(custom)).toBeVisible({ timeout: 10_000 });

  // A recipe, found despite the hyphen in its name.
  await alex.getByRole("button", { name: "Add dinner on Monday" }).click();
  await alex.getByPlaceholder("Search recipes or type any dinner").fill("white bean pie");
  await alex.getByRole("button", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  await expect(sam.getByText("Creamy Mushroom & White Bean Pie")).toBeVisible({ timeout: 10_000 });

  // Ingredients for the planned recipes, combined.
  await alex.getByRole("button", { name: "Add ingredients for 1 dinner" }).click();
  const dialog = alex.getByRole("dialog");
  await dialog.getByRole("button", { name: /Add \d+ items? to list/ }).click();
  await expect(alex.getByText(/Added \d+ item/)).toBeVisible();
  await expect(sam.getByText("on list")).toBeVisible({ timeout: 10_000 });

  // Clean up.
  for (const name of [custom, "Creamy Mushroom & White Bean Pie"]) {
    const card = alex.locator("div[draggable]").filter({ hasText: name });
    await card.getByRole("button", { name: "More" }).click();
    await alex.getByRole("button", { name: "Remove from week" }).click();
    await expect(sam.getByText(name)).toBeHidden({ timeout: 10_000 });
  }
});

test("ticked method steps are shared", async ({ browser, baseURL }) => {
  const path = "/recipes/hf-creamy-mushroom-and-white-bean-pie";
  const alex = await openAs(browser, "alex@dev.local", baseURL!);
  const sam = await openAs(browser, "sam@dev.local", baseURL!);
  await alex.goto("/recipes");
  await alex.getByPlaceholder(/Search .*recipes/).fill("White Bean Pie");
  await alex.getByRole("link", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  const url = alex.url();
  await sam.goto(url.startsWith("http") ? url : path);

  await alex.getByRole("checkbox", { name: "Step 1 done" }).click();
  await expect(sam.getByRole("checkbox", { name: "Step 1 done" })).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
  await alex.getByRole("button", { name: /Reset/ }).click();
  await expect(sam.getByRole("checkbox", { name: "Step 1 done" })).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
});

test("going back to the recipes keeps the filter and scroll position", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  await page.getByRole("link", { name: "Recipes" }).click();
  await page.getByRole("button", { name: "Quick", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quick", exact: true })).toHaveClass(/bg-primary/);
  const main = page.locator("main");
  await main.evaluate((el) => el.scrollTo({ top: 2500 }));
  await page.waitForTimeout(300);
  const before = await main.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(1500);

  const card = page.locator("main a[href^='/recipes/']").filter({ visible: true }).nth(6);
  await card.click();
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();
  await page.goBack();

  await expect(page.getByRole("button", { name: "Quick", exact: true })).toHaveClass(/bg-primary/);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(before - 50);
});
