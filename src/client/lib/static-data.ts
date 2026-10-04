import { useQuery } from "@tanstack/react-query";
import { STATIC_DATA, type RecipeDetail, type RecipeIndexEntry, type StaticCatalog } from "@/shared/static-data";
import { trpcClient } from "./trpc";

/**
 * Recipe content is static per deploy, so it's fetched as plain files rather than
 * through the API. The service worker keeps a copy (stale-while-revalidate) and
 * React Query never refetches it during a session.
 */
async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // A login page or HTML fallback must not be mistaken for data.
  if (!res.headers.get("content-type")?.includes("json")) throw new Error(`${url}: expected JSON, got ${res.headers.get("content-type")}`);
  return res.json() as Promise<T>;
}

/** Try the (possibly cached) file, then the network directly, bypassing caches. */
async function getJson<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch (first) {
    console.warn("static data fetch failed, retrying from the network", first);
    return fetchJson<T>(`${url}?fresh=${Date.now()}`, { cache: "reload" });
  }
}

const forever = { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

export function useRecipeIndex() {
  return useQuery({ queryKey: ["static", "recipes"], queryFn: () => getJson<RecipeIndexEntry[]>(STATIC_DATA.index), ...forever });
}

export function useRecipeDetail(slug: string) {
  return useQuery({
    queryKey: ["static", "recipe", slug],
    queryFn: async () => {
      try {
        return await getJson<RecipeDetail>(STATIC_DATA.recipe(slug));
      } catch (error) {
        // Last resort: the server has the same content in memory (no database involved).
        console.warn("static recipe unavailable, asking the server", error);
        return trpcClient.recipes.content.query({ slug });
      }
    },
    ...forever,
  });
}

export function useStaticCatalog() {
  return useQuery({ queryKey: ["static", "catalog"], queryFn: () => getJson<StaticCatalog>(STATIC_DATA.catalog), ...forever });
}
