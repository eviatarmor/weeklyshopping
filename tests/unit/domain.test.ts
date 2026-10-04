import { describe, expect, it } from "vitest";
import { buildProductIndex, classify } from "@/shared/classify";
import { blendTree, expandIngredients, expandRecipes, type BlendRecipe, type IngredientRow } from "@/shared/expand";
import { equipmentFor } from "@/shared/equipment";
import { searchMatcher } from "@/shared/search";
import { formatCountdown, stepTimers } from "@/shared/timers";
import { base64UrlToBytes, bytesToBase64Url, encryptPayload } from "@/server/web-push";
import { addDays, dayIndex, weekStartOf } from "@/shared/week";
import { normalizeName } from "@/shared/normalize";
import { parseIngredient } from "@/shared/parse-ingredient";
import { bulletLines, htmlToText } from "../../scripts/lib/common.ts";
import { correctedKcal, measure } from "@/shared/measure";
import { recipeSource } from "@/shared/sources";
import { addQuantities, formatQty, normalizeUnit } from "@/shared/units";

const row = (name: string, extra: Partial<IngredientRow> = {}): IngredientRow => ({
  name,
  qty: null,
  unit: null,
  productSlug: null,
  blendSlug: null,
  optional: false,
  pantry: false,
  imageUrl: null,
  ...extra,
});

describe("normalizeName", () => {
  it("singularises and strips punctuation", () => {
    expect(normalizeName("Tomatoes")).toBe("tomato");
    expect(normalizeName("Cherries")).toBe("cherry");
    expect(normalizeName("Spring Onions")).toBe("spring onion");
    expect(normalizeName("Mac & Cheese!")).toBe("mac and cheese");
  });

  it("keeps words that only look plural", () => {
    expect(normalizeName("Asparagus")).toBe("asparagus");
    expect(normalizeName("Couscous")).toBe("couscous");
    expect(normalizeName("Chickpeas")).toBe("chickpeas");
  });
});

describe("classify", () => {
  const index = buildProductIndex([
    { slug: "red-capsicum", name: "Red Capsicum", aliases: ["capsicum", "red pepper"], sectionId: "fruit-veg" },
    { slug: "milk", name: "Milk", aliases: ["full cream milk"], sectionId: "dairy-eggs" },
  ]);

  it("uses the household override first", () => {
    const result = classify({ name: "Milk", historySections: new Map([["milk", "drinks"]]), productIndex: index });
    expect(result).toMatchObject({ sectionId: "drinks", productSlug: "milk", source: "history" });
  });

  it("matches catalog names and aliases", () => {
    expect(classify({ name: "capsicums", historySections: new Map(), productIndex: index })).toMatchObject({
      sectionId: "fruit-veg",
      productSlug: "red-capsicum",
    });
  });

  it("falls back to keyword rules", () => {
    const none = { historySections: new Map<string, string>(), productIndex: index };
    expect(classify({ name: "Lamb shanks", ...none }).sectionId).toBe("meat-seafood");
    expect(classify({ name: "Chicken stock", ...none }).sectionId).toBe("pantry");
    expect(classify({ name: "Frozen chicken nuggets", ...none }).sectionId).toBe("frozen");
    expect(classify({ name: "Peanut butter", ...none }).sectionId).toBe("pantry");
    expect(classify({ name: "Widget", ...none })).toMatchObject({ sectionId: "other", source: "fallback" });
  });
});

describe("units", () => {
  it("normalises unit spellings", () => {
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("pieces")).toBeNull();
    expect(normalizeUnit("punnet")).toBe("punnet");
  });

  it("adds compatible quantities across kg/g", () => {
    expect(addQuantities({ qty: 500, unit: "g" }, { qty: 1, unit: "kg" })).toEqual({ qty: 1.5, unit: "kg" });
    expect(addQuantities({ qty: 2, unit: null }, { qty: null, unit: null })).toEqual({ qty: 3, unit: null });
  });

  it("refuses to add incompatible quantities", () => {
    expect(addQuantities({ qty: 1, unit: "packet" }, { qty: 200, unit: "g" })).toBeNull();
  });

  it("formats fractions", () => {
    expect(formatQty(0.5, null)).toBe("½");
    expect(formatQty(1.25, "tsp")).toBe("1¼ tsp");
    expect(formatQty(250, "g")).toBe("250g");
    expect(formatQty(7, "clove")).toBe("7 cloves");
    expect(formatQty(2, "bunch")).toBe("2 bunches");
    expect(formatQty(2, "tbsp")).toBe("2 tbsp");
  });
});

describe("parseIngredient", () => {
  it("parses quantity, unit, name and note", () => {
    expect(parseIngredient("2 tbsp olive oil")).toEqual({ name: "olive oil", qty: 2, unit: "tbsp", note: null });
    expect(parseIngredient("1 ½ cups rice, rinsed")).toEqual({ name: "rice", qty: 1.5, unit: "cup", note: "rinsed" });
    expect(parseIngredient("500g beef mince")).toEqual({ name: "beef mince", qty: 500, unit: "g", note: null });
    expect(parseIngredient("2-3 garlic cloves (crushed)")).toEqual({ name: "garlic cloves", qty: 3, unit: null, note: "crushed" });
  });

  it("leaves plain names alone", () => {
    expect(parseIngredient("Milk")).toEqual({ name: "Milk", qty: null, unit: null, note: null });
    expect(parseIngredient("Garlic & herb seasoning")).toMatchObject({ name: "Garlic & herb seasoning", qty: null });
  });
});

describe("expandIngredients", () => {
  const base: BlendRecipe = {
    slug: "garlic-herb",
    title: "Garlic & Herb",
    servings: 1,
    yieldUnit: "sachet",
    ingredients: [row("Garlic Powder", { qty: 1, unit: "tsp", productSlug: "garlic-powder" }), row("Salt", { qty: 0.25, unit: "tsp", productSlug: "salt", pantry: true })],
  };
  const nested: BlendRecipe = {
    slug: "herb-mushroom",
    title: "Herb & Mushroom",
    servings: 1,
    yieldUnit: "sachet",
    ingredients: [row("Garlic & Herb", { qty: 0.5, unit: "sachet", blendSlug: "garlic-herb" }), row("Porcini", { qty: 1, unit: "tsp" })],
  };
  const blends = new Map([
    [base.slug, base],
    [nested.slug, nested],
  ]);
  const recipe = [row("Chicken", { qty: 250, unit: "g", productSlug: "chicken" }), row("Herb & Mushroom", { qty: 1, unit: "sachet", blendSlug: "herb-mushroom" })];

  it("keeps blends when buying them", () => {
    const lines = expandIngredients(recipe, blends, {}, 1);
    expect(lines.map((l) => l.name)).toEqual(["Chicken", "Herb & Mushroom"]);
  });

  it("expands nested blends made from scratch and scales them", () => {
    const lines = expandIngredients(recipe, blends, { "herb-mushroom": "scratch", "garlic-herb": "scratch" }, 2);
    expect(lines).toEqual([
      expect.objectContaining({ name: "Chicken", qty: 500, unit: "g" }),
      expect.objectContaining({ name: "Garlic Powder", qty: 1, unit: "tsp", via: ["Herb & Mushroom", "Garlic & Herb"] }),
      expect.objectContaining({ name: "Salt", qty: 0.25, pantry: true }),
      expect.objectContaining({ name: "Porcini", qty: 2, unit: "tsp" }),
    ]);
  });

  it("merges duplicate lines", () => {
    const lines = expandIngredients([row("Butter", { qty: 20, unit: "g" }), row("Butter", { qty: 30, unit: "g" })], new Map(), {}, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 50, unit: "g" });
  });

  it("guards against blend cycles", () => {
    const a: BlendRecipe = { slug: "a", title: "A", servings: 1, yieldUnit: null, ingredients: [row("B", { blendSlug: "b" })] };
    const b: BlendRecipe = { slug: "b", title: "B", servings: 1, yieldUnit: null, ingredients: [row("A", { blendSlug: "a" })] };
    const cyclic = new Map([
      ["a", a],
      ["b", b],
    ]);
    expect(() => expandIngredients([row("A", { blendSlug: "a" })], cyclic, { a: "scratch", b: "scratch" }, 1)).not.toThrow();
    expect(blendTree("a", cyclic)).toMatchObject({ slug: "a", children: [{ slug: "b", children: [{ name: "A" }] }] });
  });
});

describe("measure", () => {
  it("leaves spoons alone in spoons mode", () => {
    expect(measure(2, "tsp", "Ground Cumin", "spoons")).toEqual({ qty: 2, unit: "tsp", approximate: false });
  });

  it("converts spoons and cups to grams using density", () => {
    expect(measure(1, "tbsp", "Olive Oil", "grams", "au")).toEqual({ qty: 18, unit: "g", approximate: true });
    expect(measure(1, "cup", "Plain Flour", "grams", "au")).toEqual({ qty: 140, unit: "g", approximate: true });
    expect(measure(1, "cup", "Plain Flour", "grams", "us")).toEqual({ qty: 130, unit: "g", approximate: true });
    expect(measure(0.25, "tsp", "Chilli Flakes", "grams")).toEqual({ qty: 0.5, unit: "g", approximate: true });
  });

  it("converts the ingredients people measure by the cup", () => {
    expect(measure(2, "cup", "Baby Spinach", "grams", "au")).toEqual({ qty: 60, unit: "g", approximate: true });
    expect(measure(1, "cup", "Frozen Peas", "grams", "us")).toEqual({ qty: 145, unit: "g", approximate: true });
    expect(measure(1, "cup", "Brown Lentils (dried)", "grams", "us")?.unit).toBe("g");
    expect(measure(1, "cup", "Kalamata Olives (pitted)", "grams", "us")?.unit).toBe("g");
    expect(measure(2, "tbsp", "BBQ Sauce", "grams", "au")?.unit).toBe("g");
  });

  it("doesn't confuse look-alike ingredients", () => {
    expect(measure(1, "tbsp", "Olive Oil", "grams", "au").qty).toBe(18); // oil, not olives
    expect(measure(1, "tsp", "Mustard Powder", "grams", "au").qty).toBe(2.5); // spice, not sauce
    expect(measure(1, "cup", "Coconut Milk", "grams", "au").qty).toBe(260); // milk, not desiccated coconut
  });

  it("keeps units it can't convert", () => {
    expect(measure(1, "packet", "Haloumi", "grams")).toEqual({ qty: 1, unit: "packet", approximate: false });
    expect(measure(1, "cup", "Mystery Ingredient", "grams")).toEqual({ qty: 1, unit: "cup", approximate: false });
  });
});

describe("recipeSource", () => {
  it("labels known sites", () => {
    expect(recipeSource("https://www.hellofresh.com.au/recipes/x")).toEqual({ id: "hellofresh", label: "HelloFresh" });
    expect(recipeSource("https://www.everyplate.com.au/recipes/x").label).toBe("EveryPlate");
    expect(recipeSource("https://www.mealime.com/recipes/x/1").label).toBe("Mealime");
    expect(recipeSource(null)).toEqual({ id: "diy", label: "DIY estimate" });
    expect(recipeSource("https://www.example.org/r")).toEqual({ id: "example.org", label: "example.org" });
  });
});

describe("htmlToText / bulletLines (importer cleanup)", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>Salt &amp; pepper<br>Don&#39;t stir</p>")).toBe("Salt & pepper\nDon't stir");
    expect(htmlToText("<ul><li>One</li><li>Two</li></ul>")).toBe("One\nTwo");
  });

  it("re-joins lines that were only wrapped for layout", () => {
    const html = "<p>Place veggies on a tray. Drizzle<br>with olive oil, then<br>toss to coat.<br>TIP: Use two trays.</p>";
    expect(bulletLines(htmlToText(html))).toBe("• Place veggies on a tray. Drizzle with olive oil, then toss to coat.\n• TIP: Use two trays.");
  });

  it("keeps one bullet per sentence-ending line", () => {
    expect(bulletLines("Grate carrot.\nDrain sweetcorn.")).toBe("• Grate carrot.\n• Drain sweetcorn.");
    expect(bulletLines("Just one step.")).toBe("Just one step.");
  });
});

describe("correctedKcal", () => {
  it("fixes kilojoules published as calories, using the macros", () => {
    expect(correctedKcal(2550, { proteinG: 19.4, carbsG: 107, fatG: 8.6 })).toBe(609);
  });
  it("keeps real calorie figures", () => {
    expect(correctedKcal(699, { proteinG: 30, carbsG: 60, fatG: 35 })).toBe(699);
    expect(correctedKcal(345)).toBe(345);
  });
  it("treats implausible single-serving values as kJ when there are no macros", () => {
    expect(correctedKcal(2420)).toBe(578);
  });
});

describe("search", () => {
  it("ignores case, punctuation and accents", () => {
    const matches = searchMatcher("all american")!;
    expect(matches("All-American Veggie Burger")).toBe(true);
    expect(matches("All American Burger")).toBe(true);
    expect(searchMatcher("creme fraiche")!("Crème Fraîche Pasta")).toBe(true);
    expect(searchMatcher("allamerican")!("All-American Burger")).toBe(true);
    expect(matches("American Pie")).toBe(false);
    expect(searchMatcher("  - ")).toBeNull();
  });
});

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekStartOf(new Date(2026, 9, 4))).toBe("2026-09-28"); // Sunday
    expect(weekStartOf(new Date(2026, 9, 5))).toBe("2026-10-05"); // Monday
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
    expect(dayIndex(new Date(2026, 9, 4))).toBe(6);
  });
});

describe("expandRecipes", () => {
  it("merges the same ingredient across dinners", () => {
    const row = (name: string, qty: number, unit: string | null): IngredientRow => ({
      name, qty, unit, productSlug: null, blendSlug: null, optional: false, pantry: false, imageUrl: null,
    });
    const lines = expandRecipes(
      [
        { ingredients: [row("Brown Onion", 1, null), row("Garlic", 2, "clove")], factor: 1 },
        { ingredients: [row("Brown Onion", 1, null)], factor: 2 },
      ],
      new Map(),
      {},
    );
    expect(lines.find((l) => l.name === "Brown Onion")?.qty).toBe(3);
    expect(lines).toHaveLength(2);
  });
});

describe("blendTree quantities", () => {
  it("scale with the number of sachets", () => {
    const leaf = (name: string, qty: number, unit: string): IngredientRow => ({
      name, qty, unit, productSlug: null, blendSlug: null, optional: false, pantry: false, imageUrl: null,
    });
    const blends = new Map<string, BlendRecipe>([
      ["american", { slug: "american", title: "American", servings: 1, yieldUnit: "sachet", ingredients: [leaf("Paprika", 1, "tsp")] }],
    ]);
    expect(blendTree("american", blends, 2)?.children).toEqual([{ name: "Paprika", qty: 2, unit: "tsp" }]);
  });
});

describe("web push encryption", () => {
  it("matches the RFC 8291 example", async () => {
    const asPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const pub = base64UrlToBytes(asPublic);
    const jwk = { kty: "EC", crv: "P-256", x: bytesToBase64Url(pub.slice(1, 33)), y: bytesToBase64Url(pub.slice(33, 65)) };
    const serverKeys = {
      privateKey: await crypto.subtle.importKey("jwk", { ...jwk, d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw" }, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
      publicKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []),
    };
    const body = await encryptPayload(
      new TextEncoder().encode("When I grow up, I want to be a watermelon"),
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      { serverKeys, salt: base64UrlToBytes("DGv6ra1nlYgDCS1FRnbzlw") },
    );
    expect(bytesToBase64Url(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });
});

describe("step timers", () => {
  it("finds named timers in method text", () => {
    const text = `• In a medium saucepan, heat the butter. Cook sesame seeds until fragrant, 1-2 minutes.
• Cook for 10 minutes, then remove from heat and keep covered until rice is tender, 10 minutes.
• When the rice has 5 minutes left, start the sauce.
TIP: Don't peek for 2 minutes!`;
    expect(stepTimers(text, 0)).toEqual([
      { label: "Cook sesame seeds", seconds: 120 },
      { label: "Cook", seconds: 600 },
      { label: "Remove from heat and keep…", seconds: 600 },
    ]);
    expect(formatCountdown(65_000)).toBe("1:05");
  });
});

describe("equipment", () => {
  it("reads the tools from the method", () => {
    expect(
      equipmentFor([
        { text: "Bring a medium saucepan of salted water to the boil. Cook the pasta, then drain." },
        { text: "Heat oil in a large frying pan. Blend the sauce with a stick blender, then preheat the grill." },
      ]),
    ).toEqual(["Frying pan", "Saucepan", "Stick blender", "Colander or sieve"]);
    expect(equipmentFor([{ text: "Cook the rice in a pressure cooker with the lid on." }])).toEqual(["Pressure cooker", "Lid"]);
  });
});
