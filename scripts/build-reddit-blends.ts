/**
 * Writes content/blends/*.json for the community "Hello Fresh DIY Spice Blends"
 * master list (r/hellofresh, u/kittie2171). Ratios are copied from the post and
 * scaled so one batch is 3 tsp, about one HelloFresh sachet.
 *
 *   pnpm blends:reddit
 */
import { writeFile } from "node:fs/promises";
import { slugify } from "./lib/common.ts";

const SOURCE = "https://www.reddit.com/r/hellofresh/comments/giy5tc/hello_fresh_diy_spice_blends/";
const BATCH_TSP = 3;

/** Ingredient key → catalog product. */
const P = {
  chilliPowder: ["Chilli Powder", "chilli-powder"],
  paprika: ["Sweet Paprika", "sweet-paprika"],
  smokedPaprika: ["Smoked Paprika", "smoked-paprika"],
  coriander: ["Ground Coriander", "ground-coriander"],
  corianderSeeds: ["Coriander Seeds", "coriander-seeds"],
  garlic: ["Garlic Powder", "garlic-powder"],
  mincedGarlic: ["Dried Minced Garlic", "dried-minced-garlic"],
  cumin: ["Ground Cumin", "ground-cumin"],
  cuminSeeds: ["Cumin Seeds", "cumin-seeds"],
  salt: ["Salt", "salt"],
  cayenne: ["Cayenne Pepper", "cayenne-pepper"],
  chilliFlakes: ["Chilli Flakes", "chilli-flakes"],
  blackPepper: ["Black Pepper", "black-pepper"],
  whitePepper: ["White Pepper", "white-pepper"],
  oregano: ["Dried Oregano", "dried-oregano"],
  cocoa: ["Cocoa Powder", "cocoa-powder"],
  cinnamon: ["Ground Cinnamon", "ground-cinnamon"],
  onion: ["Onion Powder", "onion-powder"],
  onionFlakes: ["Dried Onion Flakes", "dried-onion-flakes"],
  basil: ["Dried Basil", "dried-basil"],
  thyme: ["Dried Thyme", "dried-thyme"],
  rosemary: ["Dried Rosemary", "dried-rosemary"],
  parsley: ["Dried Parsley", "dried-parsley"],
  dill: ["Dried Dill", "dried-dill"],
  dillSeed: ["Dill Seeds", "dill-seeds"],
  chives: ["Dried Chives", "dried-chives"],
  mint: ["Dried Mint", "dried-mint"],
  sage: ["Ground Sage", "ground-sage"],
  marjoram: ["Dried Marjoram", "dried-marjoram"],
  allspice: ["Ground Allspice", "ground-allspice"],
  sugar: ["White Sugar", "white-sugar"],
  brownSugar: ["Brown Sugar", "brown-sugar"],
  sumac: ["Ground Sumac", "ground-sumac"],
  cloves: ["Ground Cloves", "ground-cloves"],
  mustardPowder: ["Mustard Powder", "mustard-powder"],
  mustardSeeds: ["Mustard Seeds", "mustard-seeds"],
  ginger: ["Ground Ginger", "ground-ginger"],
  turmeric: ["Ground Turmeric", "ground-turmeric"],
  fennel: ["Ground Fennel", "ground-fennel"],
  cardamom: ["Ground Cardamom", "ground-cardamom"],
  fenugreek: ["Ground Fenugreek", "ground-fenugreek"],
  caraway: ["Caraway Seeds", "caraway-seeds"],
  nutmeg: ["Nutmeg", "nutmeg"],
  sesame: ["Sesame Seeds", "sesame-seeds"],
  almonds: ["Almonds", "almonds"],
} as const;
type Key = keyof typeof P;
const PANTRY: Key[] = ["salt", "blackPepper", "sugar", "brownSugar"];

type Blend = { title: string; aliases?: string[]; note?: string; parts: [number, Key][] };

const BLENDS: Blend[] = [
  {
    title: "All American Spice Blend",
    aliases: ["All-American Spice Blend", "American Spice Blend"],
    parts: [[2, "chilliPowder"], [2, "paprika"], [1, "coriander"], [1, "garlic"], [2, "cumin"], [1, "salt"], [1, "cayenne"], [1, "chilliFlakes"], [1, "blackPepper"], [1, "oregano"], [0.25, "cocoa"], [0.125, "cinnamon"]],
  },
  {
    title: "Creole Spice Blend",
    aliases: ["Creole Seasoning"],
    parts: [[1, "paprika"], [1, "onion"], [1, "garlic"], [1, "oregano"], [1, "basil"], [0.5, "thyme"], [0.5, "blackPepper"], [0.5, "whitePepper"], [1.5, "cayenne"]],
  },
  {
    title: "Jerk Seasoning",
    aliases: ["Jamaican Jerk Seasoning", "Jerk Spice Blend", "Mild Caribbean Jerk Seasoning", "Caribbean Jerk Seasoning"],
    parts: [[12, "garlic"], [12, "thyme"], [8, "onion"], [8, "oregano"], [4, "paprika"], [4, "sugar"], [4, "allspice"], [2, "cinnamon"], [1, "whitePepper"], [1, "cayenne"]],
  },
  { title: "Mediterranean Spice Blend", aliases: ["Mediterranean Spice Mix"], parts: [[2, "oregano"], [1, "mint"], [1, "sumac"], [1, "coriander"]] },
  { title: "Fall Spice Blend", aliases: ["Autumn Herb Blend"], parts: [[3, "thyme"], [3, "sage"], [2, "garlic"], [1, "onion"]] },
  { title: "Fall Harvest Spice Blend", aliases: ["Harvest Spice Blend"], parts: [[3, "thyme"], [2, "sage"], [0.5, "garlic"], [0.5, "onion"]] },
  { title: "Autumn Spice Blend", aliases: ["Autumn (Fall) Spice Blend"], parts: [[1, "cinnamon"], [1, "cloves"], [8, "cumin"]] },
  { title: "Southwest Spice Blend", aliases: ["South West Spice Blend", "Southwest Spice", "Southwest Seasoning"], parts: [[4, "garlic"], [2, "cumin"], [2, "chilliPowder"]] },
  {
    title: "Smoky BBQ Seasoning",
    aliases: ["Smokey BBQ Seasoning", "BBQ Seasoning", "Smoky BBQ Spice Blend", "BBQ Spice Blend"],
    parts: [[8, "smokedPaprika"], [6, "sugar"], [2, "garlic"], [1, "mustardPowder"], [1, "cumin"], [1, "ginger"], [0.5, "blackPepper"]],
  },
  {
    title: "Shawarma Spice Blend",
    aliases: ["Shawarma Spice", "Shawarma Seasoning"],
    parts: [[2, "turmeric"], [2, "cumin"], [1, "coriander"], [1, "garlic"], [1, "paprika"], [0.5, "allspice"], [0.5, "blackPepper"]],
  },
  { title: "Turkish Spice Blend", aliases: ["Turkish Spice Mix", "Turkish Seasoning"], parts: [[2, "cumin"], [2, "garlic"], [1, "coriander"], [0.25, "allspice"], [0.25, "chilliFlakes"]] },
  {
    title: "Cajun Spice Blend",
    aliases: ["Cajun Spice", "Cajun Seasoning", "Cajun Spice Mix"],
    parts: [[2, "paprika"], [2, "onion"], [1, "garlic"], [1, "oregano"], [1, "thyme"], [0.5, "basil"], [0.5, "cayenne"]],
  },
  {
    title: "Berbere Spice Blend",
    aliases: ["Berbere Spice", "Berbere Seasoning"],
    parts: [[3, "paprika"], [1, "cayenne"], [0.5, "coriander"], [0.25, "ginger"], [0.125, "cardamom"], [0.125, "fenugreek"]],
  },
  {
    title: "Tuscan Heat Spice Blend",
    aliases: ["Tuscan Heat Spice", "Tuscan Heat Seasoning", "Tuscan Spice Blend"],
    parts: [[4, "basil"], [2, "rosemary"], [2, "oregano"], [2, "garlic"], [1, "cayenne"], [1, "fennel"]],
  },
  { title: "Fry Seasoning", aliases: ["Fry Spice", "Fry Spice Blend"], parts: [[1, "garlic"], [1, "onion"], [1, "paprika"]] },
  { title: "Meatloaf Seasoning", aliases: ["Meatloaf Spice Blend"], parts: [[2, "garlic"], [2, "onion"], [1, "thyme"], [1, "basil"]] },
  {
    title: "Tunisian Spice Blend",
    aliases: ["Tunisian Spice", "Tunisian Seasoning"],
    parts: [[4, "caraway"], [4, "coriander"], [4, "smokedPaprika"], [4, "turmeric"], [4, "chilliPowder"], [4, "garlic"], [1, "cayenne"], [1, "cinnamon"], [1, "blackPepper"]],
  },
  {
    title: "Mexican Spice Blend",
    aliases: ["Mexican Spice Mix", "Mexican Seasoning", "Mexican Fiesta Spice Blend"],
    // Given in spoons in the post: 2 tbsp, 1 tbsp, ½ tbsp… (converted to tsp parts).
    parts: [[6, "chilliPowder"], [3, "cumin"], [1.5, "salt"], [1.5, "blackPepper"], [1, "paprika"], [0.5, "chilliFlakes"], [0.5, "oregano"], [0.5, "garlic"], [0.5, "onion"], [0.25, "cayenne"]],
  },
  { title: "Smoky Mexican Spice Mix", aliases: ["Smoky Mexican Spice Blend", "Smokey Mexican Spice Mix"], parts: [[2, "chilliPowder"], [1, "oregano"], [1, "smokedPaprika"], [1, "cumin"]] },
  {
    title: "Burger Spice Blend",
    aliases: ["Burger Seasoning", "Burger Spice"],
    parts: [[3, "paprika"], [1.25, "salt"], [1, "blackPepper"], [0.5, "garlic"], [0.5, "brownSugar"], [0.5, "onion"], [0.25, "cayenne"]],
  },
  {
    title: "Smoky Cinnamon Paprika Spice",
    aliases: ["Smokey Cinnamon Paprika Spice", "Smoky Cinnamon Paprika Spice Blend"],
    parts: [[1, "cloves"], [8, "onion"], [8, "cinnamon"], [6, "smokedPaprika"], [16, "mustardPowder"], [24, "paprika"], [24, "sugar"]],
  },
  { title: "Swedish Spice Blend", aliases: ["Swedish Seasoning"], parts: [[4, "garlic"], [2, "allspice"], [2, "whitePepper"], [1, "nutmeg"]] },
  {
    title: "Blackening Spice",
    aliases: ["Blackening Spice Blend", "Blackened Spice"],
    parts: [[3, "smokedPaprika"], [1.5, "paprika"], [1.5, "onion"], [1, "garlic"], [0.5, "whitePepper"], [0.5, "blackPepper"], [0.25, "thyme"], [0.25, "oregano"], [0.125, "cayenne"]],
  },
  {
    title: "Southern Sizzle Spice",
    aliases: ["Blackening (Southern Sizzle) Spice", "Southern Sizzle Spice Blend", "Southern Sizzle Seasoning"],
    parts: [[3, "smokedPaprika"], [1.5, "garlic"], [0.5, "whitePepper"], [0.5, "blackPepper"], [0.25, "thyme"], [0.25, "oregano"], [0.125, "cayenne"]],
  },
  { title: "Italian Seasoning", aliases: ["Italian Spice Blend", "Italian Seasoning Blend", "Tuscan Seasoning"], parts: [[1, "garlic"], [1, "oregano"], [1, "basil"], [1, "blackPepper"], [1, "parsley"]] },
  {
    title: "Fajita Spice Blend",
    aliases: ["Fajita Seasoning", "Fajita Spice Mix", "Fajita Spice"],
    parts: [[4, "paprika"], [1, "onion"], [1, "garlic"], [1, "chilliPowder"], [1, "cumin"], [1, "oregano"]],
  },
  { title: "Enchilada Spice Blend", aliases: ["Enchilada Seasoning"], parts: [[3, "chilliPowder"], [1, "cumin"], [1, "oregano"]] },
  { title: "Moo Shu Spice Blend", aliases: ["Moo Shu Seasoning"], parts: [[1, "ginger"], [1, "garlic"]] },
  {
    title: "Thai Seven Spice Blend",
    aliases: ["Thai 7 Spice Blend", "Thai Seven Spice"],
    note: "The original includes ½ tsp shrimp extract powder; it's left out here to keep the blend vegetarian.",
    parts: [[2.5, "sesame"], [1, "chilliFlakes"], [1, "coriander"], [1, "onion"], [0.5, "garlic"], [0.25, "cinnamon"], [0.125, "cayenne"]],
  },
  {
    title: "Garden Ranch Spice Blend",
    aliases: ["Garden Ranch Seasoning", "Ranch Spice Blend", "Ranch Seasoning"],
    parts: [[2, "parsley"], [1, "dill"], [2, "garlic"], [2, "onion"], [2, "onionFlakes"], [1, "blackPepper"], [1, "chives"]],
  },
  {
    title: "Steak Spice Blend",
    aliases: ["Steak Spice", "Steak Seasoning"],
    parts: [[1, "chilliFlakes"], [1, "corianderSeeds"], [2, "dillSeed"], [3, "mustardSeeds"], [4, "mincedGarlic"], [4, "blackPepper"], [3, "salt"]],
  },
  {
    title: "Bold & Savory Steak Spice Blend",
    aliases: ["Bold and Savory Steak Spice Blend", "Bold & Savoury Steak Spice Blend"],
    note: "The post suggests 4 parts chilli flakes for heat, or 1 part for a milder blend.",
    parts: [[4, "chilliFlakes"], [1, "corianderSeeds"], [2, "dillSeed"], [3, "mustardSeeds"], [4, "mincedGarlic"], [4, "blackPepper"], [3, "salt"]],
  },
  { title: "Taco Spice Blend", aliases: ["Taco Seasoning", "Taco Spice Mix", "Taco Spice"], parts: [[1, "cumin"], [1, "oregano"], [1, "garlic"], [1, "chilliPowder"]] },
  {
    title: "Za'atar Blend",
    aliases: ["Za'atar", "Zaatar", "Za'atar Spice Blend", "Za’atar Blend"],
    parts: [[1, "thyme"], [1, "sesame"], [1, "sumac"], [0.5, "oregano"], [0.5, "marjoram"], [0.5, "blackPepper"]],
  },
  {
    title: "Middle Eastern Spice Blend",
    aliases: ["Middle Eastern Spice Sachet", "Middle Eastern Spice Mix", "Middle Eastern Seasoning"],
    parts: [[5, "paprika"], [3, "garlic"], [2, "turmeric"], [2, "coriander"], [2, "blackPepper"], [1, "allspice"], [2.5, "salt"]],
  },
  { title: "Dukkah Spice Blend", aliases: ["Dukkah", "Dukkah Spice"], parts: [[4, "almonds"], [2, "sesame"], [2, "corianderSeeds"], [1, "cuminSeeds"]] },
  {
    title: "Chermoula Spice Blend",
    aliases: ["Chermoula Seasoning", "Chermoula Spice", "Chermoula Spice Mix"],
    parts: [[24, "cumin"], [12, "coriander"], [6, "paprika"], [6, "chilliPowder"], [4, "cinnamon"], [3, "allspice"], [3, "ginger"], [1, "cayenne"], [2, "turmeric"]],
  },
  { title: "Mole Spice Blend", aliases: ["Mole Spice", "Mole Seasoning"], parts: [[1, "cocoa"], [1, "cumin"], [1, "chilliPowder"], [1, "smokedPaprika"]] },
  {
    title: "Southeast Asian Spice Blend",
    aliases: ["Southeast Asian Spice", "South East Asian Spice Blend", "Southeast Asian Seasoning"],
    parts: [[1, "salt"], [1, "onion"], [1, "paprika"], [1, "cumin"], [1, "coriander"], [1, "sugar"], [1, "ginger"], [0.5, "cinnamon"], [0.25, "cayenne"]],
  },
];

/** Round to the nearest ⅛ tsp, never below ⅛. */
const toTsp = (value: number) => Math.max(0.125, Math.round(value * 8) / 8);

for (const blend of BLENDS) {
  const total = blend.parts.reduce((sum, [n]) => sum + n, 0);
  const ratio = blend.parts.map(([n, key]) => `${n} ${P[key][0].toLowerCase()}`).join(", ");
  const recipe = {
    slug: slugify(blend.title),
    kind: "blend",
    title: blend.title,
    description: `From the r/hellofresh DIY spice blend master list, scaled so one batch (about ${BATCH_TSP} tsp) replaces one sachet. Original ratio: ${ratio}.${blend.note ? ` ${blend.note}` : ""}`,
    sourceUrl: SOURCE,
    servings: 1,
    yieldUnit: "sachet",
    tags: ["blend", "reddit"],
    aliases: blend.aliases ?? [],
    addedAt: "2026-10-04",
    ingredients: blend.parts.map(([n, key]) => ({
      name: P[key][0],
      qty: toTsp((n / total) * BATCH_TSP),
      unit: "tsp",
      product: P[key][1],
      ...(PANTRY.includes(key) ? { pantry: true } : {}),
    })),
    steps: [
      { text: "Mix everything in a small bowl. Use the whole batch wherever a recipe calls for 1 sachet." },
      { text: `To keep a jar: multiply every amount by the same number (e.g. ×8 fills a small spice jar).` },
    ],
  };
  await writeFile(`content/blends/${recipe.slug}.json`, `${JSON.stringify(recipe, null, 2)}\n`);
}
console.log(`Wrote ${BLENDS.length} blends from the r/hellofresh list`);
