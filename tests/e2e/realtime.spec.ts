import { expect, test, type Browser, type Page } from "@playwright/test";

/** Each dev user gets its own browser context, like two phones. */
async function openAs(browser: Browser, email: string, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  // Never call the real supermarkets from tests.
  await context.route("**/trpc/prices.compare**", (route) =>
    route.fulfill({ json: { result: { data: { json: { cheapest: null, bestValue: null, offers: [], fetchedAt: 0 } } } } }),
  );
  await context.addCookies([{ name: "dev_user", value: email, url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
  // Wait until the live-update stream is connected (the first request can be slow while content syncs).
  await expect(page.locator("html[data-sync=pending]")).toBeAttached({ timeout: 30_000 });
  return page;
}

test("items sync live between two people", async ({ browser, baseURL }) => {
  const alex = await openAs(browser, "alex@dev.local", baseURL!);
  const sam = await openAs(browser, "sam@dev.local", baseURL!);
  const item = `Test item ${Date.now()}`;

  const input = alex.getByRole("textbox", { name: "Add item" });
  await input.fill(item);
  await input.press("Enter");
  // Close the suggestions dropdown so it doesn't cover the list.
  await input.press("Escape");
  await expect(alex.getByRole("listitem").filter({ hasText: item })).toBeVisible();

  // Appears on the other phone without a reload.
  await expect(sam.getByText(item)).toBeVisible({ timeout: 10_000 });

  // Checking it off on one phone moves it to the trolley on the other.
  await sam.getByRole("checkbox", { name: `Check ${item}` }).click();
  await expect(alex.getByRole("checkbox", { name: `Uncheck ${item}` })).toBeVisible({ timeout: 10_000 });

  // Clean up so the shared dev list doesn't grow forever.
  await alex.getByRole("listitem").filter({ hasText: item }).getByRole("button", { name: item }).click();
  await alex.getByRole("button", { name: "Delete" }).click();
  await expect(sam.getByText(item)).toBeHidden({ timeout: 10_000 });
});

test("recipe ingredients go through the pantry check onto the list", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  await page.getByRole("link", { name: "Recipes" }).click();
  await page.getByPlaceholder(/Search .*recipes/).fill("White Bean Pie");
  await page.getByRole("link", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  await page.getByRole("button", { name: "Add to list" }).filter({ visible: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Already have any of these?")).toBeVisible();
  // Herb & Mushroom Seasoning is a blend: make it from scratch instead of buying the sachet.
  await dialog.getByRole("button", { name: "Make it" }).first().click();
  await expect(dialog.getByText("Dried Porcini Mushrooms")).toBeVisible();

  await dialog.getByRole("button", { name: /Add \d+ items? to list/ }).click();
  await expect(page.getByText(/Added \d+ item/)).toBeVisible();
  // The drawer drops its #sheet history entry as it closes; let that finish before navigating.
  await expect.poll(() => page.url()).not.toContain("#sheet");

  await page.goto("/");
  await expect(page.getByText("for Creamy Mushroom & White Bean Pie").first()).toBeVisible();
});

test("meal filters don't leak into the blends tab", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  await page.getByRole("link", { name: "Recipes" }).click();
  const search = page.getByPlaceholder(/Search .*recipes/);
  await search.fill("zzz-no-such-recipe");
  await expect(page.getByText("No recipes match.")).toBeVisible();

  await page.getByRole("button", { name: "Blends" }).click();
  await expect(page.getByPlaceholder("Search blends")).toHaveValue("");
  await expect(page.getByRole("link", { name: /All American Spice Blend/ })).toBeVisible();

  // Back on meals, the meal search is still there.
  await page.getByRole("button", { name: "Meals" }).click();
  await expect(page.getByPlaceholder(/Search .*recipes/)).toHaveValue("zzz-no-such-recipe");
});

test("rating a recipe produces recommendations, and energy follows the kJ/kcal setting", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "sam@dev.local", baseURL!);
  await page.getByRole("link", { name: "Recipes" }).click();
  await page.getByPlaceholder(/Search .*recipes/).fill("Bengal Chickpea Curry");
  await page.getByRole("link", { name: /Bengal Chickpea Curry/ }).first().click();

  // Energy shows in kJ by default.
  await expect(page.getByText(/\d[\d,]* kJ/).first()).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByPlaceholder(/Search .*recipes/).fill("");
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await expect(page.getByText(/Because you liked /).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "kcal" }).click();
  await page.getByRole("link", { name: "Recipes" }).click();
  await expect(page.getByText(/\d[\d,]* kcal/).first()).toBeVisible();
});
