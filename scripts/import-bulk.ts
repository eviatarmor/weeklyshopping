/**
 * Import whole vegetarian collections.
 *
 *   pnpm recipe:bulk hellofresh       # https://www.hellofresh.com.au/recipes/vegetarian-recipes
 *   pnpm recipe:bulk hellofresh-all   # every HelloFresh AU recipe tagged "veggie"
 *   pnpm recipe:bulk everyplate   # every EveryPlate AU recipe tagged "veggie"
 *   pnpm recipe:bulk mealime      # every Mealime recipe with a vegetarian/vegan variant
 *   ... [--force] [--limit N]
 *
 * Every recipe also goes through the --vegetarian ingredient check, so anything
 * with meat or seafood is rejected even if the source tagged it vegetarian.
 */
import type { RecipeContent } from "../src/shared/content.ts";
import { writeFile } from "node:fs/promises";
import { fetchText, mapLimit, newReport, nextData, rejections, saveRecipe, type Report } from "./lib/common.ts";
import { convertHelloFresh, fetchHelloFreshRecipe, type HfRecipe } from "./lib/hellofresh.ts";
import { MEALIME_VEGAN, MEALIME_VEGETARIAN, convertMealime, fetchMealimeRecipe } from "./lib/mealime.ts";

const [source, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
const limitArg = rest.indexOf("--limit");
const limit = limitArg >= 0 ? Number(rest[limitArg + 1]) : Infinity;

type Job = { label: string; load: (report: Report) => Promise<RecipeContent> };

async function helloFreshJobs(): Promise<Job[]> {
  const ssr = nextData(await fetchText("https://www.hellofresh.com.au/recipes/vegetarian-recipes")).props.pageProps.ssrPayload;
  const url = (r: { websiteUrl?: string; slug: string; recipeId?: string; id: string }) =>
    r.websiteUrl ?? `https://www.hellofresh.com.au/recipes/${r.slug}-${r.recipeId ?? r.id}`;
  const urls = new Set<string>(ssr.collection.recipes.map(url));
  for (const q of ssr.dehydratedState.queries) {
    // Only carousels filtered to the vegetarian collection ("best rated" is site-wide).
    if (q.queryKey[0] !== "foodContentHubRecipe.all" || !q.queryKey[1]?.searchParams?.where?.["recipeCollectionTags.id"]) continue;
    for (const r of q.state.data.pages) urls.add(url(r));
  }
  return [...urls].map((u) => ({ label: u, load: async (report) => convertHelloFresh(await fetchHelloFreshRecipe(u), "hellofresh", report) }));
}

type GatewayRecipe = HfRecipe & { id: string; isAddon?: boolean; createdAt: string };

/**
 * Every recipe with the "veggie" tag, via the recipe search the brand's own archive
 * pages use (the page embeds an anonymous token for it).
 */
async function veggieTagJobs(brand: "hellofresh" | "everyplate", pageUrl: string, country: string): Promise<Job[]> {
  const ssr = nextData(await fetchText(pageUrl)).props.pageProps.ssrPayload;
  const token = ssr.serverAuth?.access_token;
  if (!token) throw new Error(`No access token on ${pageUrl}`);
  const origin = new URL(pageUrl).origin;
  const all: GatewayRecipe[] = [];
  for (let skip = 0; ; skip += 50) {
    const data = JSON.parse(
      await fetchText(`${origin}/gw/recipes/recipes/search?country=${country}&locale=en-AU&tag=veggie&take=50&skip=${skip}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    all.push(...data.items);
    if (skip + 50 >= data.total || data.items.length === 0) break;
  }
  // The same dish is re-run under new ids; keep the newest copy of each title.
  const byTitle = new Map<string, GatewayRecipe>();
  for (const r of all) {
    if (r.isAddon || !r.ingredients?.length || !r.yields?.length) continue;
    const key = r.name.toLowerCase().replace(/s+/g, " ").trim();
    const prev = byTitle.get(key);
    if (!prev || r.createdAt > prev.createdAt) byTitle.set(key, r);
  }
  return [...byTitle.values()].map((r) => ({ label: r.name, load: (report) => convertHelloFresh(r, brand, report) }));
}

const everyPlateJobs = () => veggieTagJobs("everyplate", "https://www.everyplate.com.au/recipes/veggie-recipes", "AO");
const helloFreshAllJobs = () => veggieTagJobs("hellofresh", "https://www.hellofresh.com.au/recipes/vegetarian-recipes", "AU");

async function mealimeJobs(): Promise<Job[]> {
  const index = nextData(await fetchText("https://www.mealime.com/recipes")).props.pageProps.reducedVariants as {
    id: number;
    recipeId: number;
    types: number[];
  }[];
  const sitemap = await fetchText("https://www.mealime.com/sitemap.xml");
  const urlById = new Map<number, string>();
  for (const m of sitemap.matchAll(/<loc>(https:\/\/www\.mealime\.com\/recipes\/[^<]+\/(\d+))<\/loc>/g)) urlById.set(Number(m[2]), m[1]!);
  // One variant per recipe, preferring the vegetarian one over vegan.
  const chosen = new Map<number, number>();
  for (const v of index) {
    if (v.types.includes(MEALIME_VEGETARIAN) && !chosen.has(v.recipeId)) chosen.set(v.recipeId, v.id);
  }
  for (const v of index) {
    if (v.types.includes(MEALIME_VEGAN) && !chosen.has(v.recipeId)) chosen.set(v.recipeId, v.id);
  }
  return [...chosen.values()]
    .map((id) => urlById.get(id))
    .filter((u): u is string => !!u)
    .map((u) => ({
      label: u,
      load: async (report) => {
        const { recipe, canonical } = await fetchMealimeRecipe(u);
        return convertMealime(recipe, canonical, report);
      },
    }));
}

const SOURCES: Record<string, () => Promise<Job[]>> = {
  hellofresh: helloFreshJobs,
  "hellofresh-all": helloFreshAllJobs,
  everyplate: everyPlateJobs,
  mealime: mealimeJobs,
};
const loadJobs = source ? SOURCES[source] : undefined;
if (!loadJobs) {
  console.error(`Usage: pnpm recipe:bulk <${Object.keys(SOURCES).join("|")}> [--force] [--limit N]`);
  process.exit(1);
}

const jobs = (await loadJobs()).slice(0, limit);
console.log(`${source}: ${jobs.length} candidate recipes`);
const counts = { wrote: 0, skipped: 0, rejected: 0, failed: 0 };
const unmatched = new Map<string, number>();
const missingBlends = new Map<string, number>();
const slugs = new Set<string>();

await mapLimit(jobs, 4, async (job) => {
  const report = newReport();
  try {
    const recipe = await job.load(report);
    if (slugs.has(recipe.slug)) {
      counts.skipped++;
      return;
    }
    slugs.add(recipe.slug);
    const result = await saveRecipe(recipe, report, { force, vegetarian: true, quiet: true });
    counts[result]++;
    if (result === "wrote") {
      for (const n of report.unmatched) unmatched.set(n, (unmatched.get(n) ?? 0) + 1);
      for (const n of report.missingBlends) missingBlends.set(n, (missingBlends.get(n) ?? 0) + 1);
    }
  } catch (error) {
    counts.failed++;
    console.error(`fail ${job.label}: ${(error as Error).message}`);
  }
});

if (rejections.length) await writeFile(`.cache/rejected-${source}.json`, JSON.stringify(rejections, null, 2));

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
console.log(`done: ${counts.wrote} written, ${counts.skipped} skipped, ${counts.rejected} rejected as not vegetarian, ${counts.failed} failed`);
if (missingBlends.size) console.log(`blends without a recipe: ${top(missingBlends, 40)}`);
if (unmatched.size) console.log(`most common ingredients not in the catalog: ${top(unmatched, 60)}`);
