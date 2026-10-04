import { useQuery } from "@tanstack/react-query";
import { STATIC_DATA, type RecipeDetail, type RecipeIndexEntry, type StaticCatalog } from "@/shared/static-data";

/**
 * Recipe content is static per deploy, so it's fetched as plain files rather than
 * through the API. The service worker keeps a copy (stale-while-revalidate) and
 * React Query never refetches it during a session.
 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const forever = { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

export function useRecipeIndex() {
  return useQuery({ queryKey: ["static", "recipes"], queryFn: () => getJson<RecipeIndexEntry[]>(STATIC_DATA.index), ...forever });
}

export function useRecipeDetail(slug: string) {
  return useQuery({ queryKey: ["static", "recipe", slug], queryFn: () => getJson<RecipeDetail>(STATIC_DATA.recipe(slug)), ...forever });
}

export function useStaticCatalog() {
  return useQuery({ queryKey: ["static", "catalog"], queryFn: () => getJson<StaticCatalog>(STATIC_DATA.catalog), ...forever });
}
