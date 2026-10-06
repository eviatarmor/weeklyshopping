import { expect, test, type Browser, type Page } from "@playwright/test";

async function openAs(browser: Browser, email: string, baseURL: string, path = "/"): Promise<Page> {
  const context = await browser.newContext();
  // Never call the real supermarkets from tests.
  await context.route("**/trpc/prices.compare**", (route) =>
    route.fulfill({ json: { result: { data: { json: { cheapest: null, bestValue: null, offers: [], fetchedAt: 0 } } } } }),
  );
  await context.addCookies([{ name: "dev_user", value: email, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("html[data-sync=pending]")).toBeAttached({ timeout: 30_000 });
  return page;
}

test("dinners planned on one phone show up on the other, and can go onto the list", async ({ browser, baseURL }) => {
  // A random week far in the future, so runs don't collide with real plans or with each other.
  const monday = new Date(Date.UTC(2031, 0, 6 + 7 * Math.floor(Math.random() * 500)));
  const week = monday.toISOString().slice(0, 10);
  const alex = await openAs(browser, "alex@dev.local", baseURL!, `/week?w=${week}`);
  const sam = await openAs(browser, "sam@dev.local", baseURL!, `/week?w=${week}`);
  const custom = `Pizza night ${Date.now()}`;

  // A dinner with just a name.
  await alex.getByRole("button", { name: "Add dinner" }).first().click();
  await alex.getByPlaceholder("Search recipes or type any dinner").fill(custom);
  await alex.getByRole("button", { name: `Add "${custom}"` }).click();
  await expect(alex.getByRole("heading", { name: "Add dinner" })).toBeHidden();
  await expect(sam.getByText(custom)).toBeVisible({ timeout: 10_000 });

  // A recipe, found despite the hyphen in its name.
  await alex.getByRole("button", { name: "Add dinner" }).first().click();
  await alex.getByPlaceholder("Search recipes or type any dinner").fill("white bean pie");
  await alex.getByRole("button", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  await expect(alex.getByRole("heading", { name: "Add dinner" })).toBeHidden();
  await expect(sam.getByText("Creamy Mushroom & White Bean Pie")).toBeVisible({ timeout: 10_000 });

  // Ingredients for the planned recipes, combined.
  await alex.getByRole("button", { name: "Add 1 to list" }).click();
  const dialog = alex.getByRole("dialog");
  await dialog.getByRole("button", { name: /Add \d+ items? to list/ }).click();
  await expect(alex.getByText(/Added \d+ item/)).toBeVisible();
  await expect(sam.getByText("on list")).toBeVisible({ timeout: 10_000 });

  // Clean up.
  for (const name of [custom, "Creamy Mushroom & White Bean Pie"]) {
    const card = alex.locator("div[data-meal]").filter({ hasText: name });
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
  // Wait until Sam's page is connected to live updates.
  await expect(sam.locator("html[data-sync=pending]")).toBeAttached({ timeout: 30_000 });
  // Start from nothing ticked (an earlier failed run may have left a tick behind).
  const step = alex.getByRole("checkbox", { name: "Step 1 done" });
  if ((await step.getAttribute("aria-checked")) === "true") await step.click();
  await expect(sam.getByRole("checkbox", { name: "Step 1 done" })).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });

  await step.click();
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
  // Wait for the first page of cards before scrolling.
  await expect(page.locator("main a[href^='/recipes/']").nth(30)).toBeAttached({ timeout: 15_000 });
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

test("cooking mode: tick spices, minimise to a bar, finish", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  await page.goto("/recipes");
  await page.getByPlaceholder(/Search .*recipes/).fill("White Bean Pie");
  await page.getByRole("link", { name: /Creamy Mushroom & White Bean Pie/ }).click();

  // A spice inside the blend can be ticked on its own.
  const spice = page.getByRole("checkbox", { name: /added$/ }).nth(3);
  await spice.click();
  await expect(spice).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Start cooking" }).filter({ visible: true }).click();
  await page.getByRole("link", { name: "Back" }).or(page.getByRole("button", { name: "Back" })).click();
  const bar = page.getByText("Cooking · screen stays on");
  await expect(bar).toBeVisible();
  await page.getByRole("link", { name: "Week", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Dinners" })).toBeVisible();
  await expect(bar).toBeVisible();

  // Back to the recipe from the bar, then stop.
  await page.getByRole("link", { name: /Cooking · screen stays on/ }).click();
  await expect(bar).toBeHidden();
  await page.getByRole("button", { name: "Stop cooking" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: /Reset/ }).click();
  await expect(spice).toHaveAttribute("aria-checked", "false");
});

test("step timers: start in cooking mode, shared, and the alarm fires", async ({ browser, baseURL }) => {
  const alex = await openAs(browser, "alex@dev.local", baseURL!);
  const sam = await openAs(browser, "sam@dev.local", baseURL!);
  await alex.goto("/recipes");
  await alex.getByPlaceholder(/Search .*recipes/).fill("White Bean Pie");
  await alex.getByRole("link", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  const url = alex.url();

  // No timers until cooking starts.
  await expect(alex.getByRole("button", { name: /^Start "/ })).toHaveCount(0);
  await alex.getByRole("button", { name: "Start cooking" }).filter({ visible: true }).click();
  const first = alex.getByRole("button", { name: /^Start "/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(alex.getByText("Running").first()).toBeVisible();

  // The other phone sees it while cooking the same recipe.
  await sam.goto(url);
  await sam.getByRole("button", { name: "Start cooking" }).filter({ visible: true }).click();
  await expect(sam.getByText("Running").first()).toBeVisible({ timeout: 10_000 });
  await sam.getByRole("button", { name: "Stop timer" }).first().click();
  await expect(alex.getByText("Running")).toHaveCount(0, { timeout: 10_000 });

  // A short timer is fired by the server's alarm.
  const call = (path: string, input: unknown) =>
    alex.request.post(`/trpc/${path}`, { data: { json: input }, headers: { "content-type": "application/json" } });
  const started = await call("timers.start", { recipeSlug: null, label: "Quick test", seconds: 5 });
  expect(started.ok()).toBe(true);
  const id = (await started.json()).result.data.json.id as string;
  await expect
    .poll(async () => {
      const res = await alex.request.get(`/trpc/timers.list`);
      const list = (await res.json()).result.data.json as { id: string; firedAt: number | null }[];
      return list.find((t) => t.id === id)?.firedAt ?? null;
    }, { timeout: 15_000 })
    .not.toBeNull();
  await call("timers.remove", { id });
  await alex.getByRole("button", { name: "Stop cooking" }).filter({ visible: true }).click();
  await sam.getByRole("button", { name: "Stop cooking" }).filter({ visible: true }).click();
});

test("swipe an item left to delete it, and undo", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  const item = `Swipe me ${Date.now()}`;
  const input = page.getByRole("textbox", { name: "Add item" });
  await input.fill(item);
  await input.press("Enter");
  await input.press("Escape");
  // Escape closes the suggestions a moment later; wait so they don't cover the list.
  await page.waitForTimeout(400);
  const row = page.locator("main").getByRole("listitem").filter({ hasText: item });
  await expect(row).toBeVisible();

  // Keep it clear of the tab bar at the bottom.
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  for (let x = box.width - 40; x > box.width - 220; x -= 20) await page.mouse.move(box.x + x, y);
  await page.mouse.up();
  await expect(row).toBeHidden();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("main").getByRole("listitem").filter({ hasText: item })).toBeVisible();
  // Clean up.
  await page.locator("main").getByRole("listitem").filter({ hasText: item }).getByRole("button", { name: item }).click();
  await page.getByRole("button", { name: "Delete" }).click();
});

test("offline: ticking items still works and syncs when back online", async ({ browser, baseURL }) => {
  const alex = await openAs(browser, "alex@dev.local", baseURL!);
  const sam = await openAs(browser, "sam@dev.local", baseURL!);
  const item = `Offline item ${Date.now()}`;
  const input = alex.getByRole("textbox", { name: "Add item" });
  await input.fill(item);
  await input.press("Enter");
  await input.press("Escape");
  await expect(sam.getByText(item)).toBeVisible({ timeout: 10_000 });

  await alex.context().setOffline(true);
  await expect(alex.getByText(/Offline: the list still works/)).toBeVisible();
  await alex.getByRole("checkbox", { name: `Check ${item}` }).click();
  await expect(alex.getByRole("checkbox", { name: `Uncheck ${item}` })).toBeVisible();

  await alex.context().setOffline(false);
  await expect(sam.getByRole("checkbox", { name: `Uncheck ${item}` })).toBeVisible({ timeout: 15_000 });
  // Clean up.
  await alex.locator("main").getByRole("listitem").filter({ hasText: item }).getByRole("button", { name: item }).click();
  await alex.getByRole("button", { name: "Delete" }).click();
});

test("back closes a drawer; the ingredient menu opens substitutions", async ({ browser, baseURL }) => {
  const page = await openAs(browser, "alex@dev.local", baseURL!);
  await page.goto("/recipes");
  await page.getByPlaceholder(/Search .*recipes/).fill("White Bean Pie");
  await page.getByRole("link", { name: /Creamy Mushroom & White Bean Pie/ }).click();
  const recipeUrl = page.url();

  // ⋯ → Substitutions opens the drawer, with #sheet in the URL.
  await page.getByRole("button", { name: "More for Potato" }).click();
  await page.getByRole("menuitem", { name: /Substitutions/ }).click();
  await expect(page.getByText("Instead of Potato")).toBeVisible();
  expect(page.url()).toContain("#sheet");

  // Back closes the drawer and stays on the recipe.
  await page.goBack();
  await expect(page.getByText("Instead of Potato")).toBeHidden();
  expect(page.url()).toBe(recipeUrl);
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();

  // Closing a drawer from the app also removes its history entry.
  await page.getByRole("button", { name: "Add to list" }).filter({ visible: true }).click();
  await expect(page.getByText("Already have any of these?")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Already have any of these?")).toBeHidden();
  await expect.poll(() => page.url()).toBe(recipeUrl);
});
