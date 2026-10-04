/**
 * Search clients for Woolworths and Coles, using the same public endpoints their
 * websites use (see github.com/MattTimms/coles_vs_woolies). Each returns offers with a
 * normalised unit price, and can fetch a product's ingredient list for the vegetarian check.
 */
import type { Offer, Store } from "@/shared/grocery";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 8000;

/**
 * At most a couple of requests to each store at a time. A whole list asks for prices at once, and a
 * burst of parallel requests gets us blocked by the stores' bot protection.
 */
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
const LIMITS: Record<string, ReturnType<typeof limiter>> = { "www.coles.com.au": limiter(2), "www.woolworths.com.au": limiter(3) };

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).hostname;
  const run = () => fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const res = await (LIMITS[host] ? LIMITS[host](run) : run());
  if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
  return res;
}

/** Share one in-flight request between callers (e.g. the store's home page for a session). */
function shared<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load().finally(() => (pending = null)));
}

/** "$0.54/ 100g", "$2.20 per 1kg", "$0.63 / 1EA" → dollars per kg, litre or each. */
export function parseUnitPrice(label: string | null | undefined): { unitPrice: number; unitBasis: "kg" | "l" | "each" } | null {
  const m = label?.match(/\$\s*([\d.]+)\s*(?:\/|per)\s*([\d.]*)\s*(kg|g|ml|l|ea|each)\b/i);
  if (!m) return null;
  const price = Number(m[1]);
  const qty = Number(m[2] || 1);
  const unit = m[3]!.toLowerCase();
  if (!Number.isFinite(price) || !qty) return null;
  if (unit === "g") return { unitPrice: (price / qty) * 1000, unitBasis: "kg" };
  if (unit === "kg") return { unitPrice: price / qty, unitBasis: "kg" };
  if (unit === "ml") return { unitPrice: (price / qty) * 1000, unitBasis: "l" };
  if (unit === "l") return { unitPrice: price / qty, unitBasis: "l" };
  return { unitPrice: price / qty, unitBasis: "each" };
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- Woolworths ----------
let wooliesCookies: { value: string; at: number } | null = null;
const loadWooliesSession = shared(async () => {
  const home = await get("https://www.woolworths.com.au/", { headers: { accept: "text/html" } });
  const value = home.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  wooliesCookies = { value, at: Date.now() };
  return value;
});
async function wooliesSession(): Promise<string> {
  if (wooliesCookies && Date.now() - wooliesCookies.at < 30 * 60_000) return wooliesCookies.value;
  return loadWooliesSession();
}

type WooliesProduct = {
  Stockcode: number; DisplayName: string; Name: string; Price: number | null; WasPrice: number | null; CupString: string | null;
  PackageSize: string | null; UrlFriendlyName: string; MediumImageFile: string | null; IsAvailable: boolean;
};

async function searchWoolworths(term: string): Promise<Offer[]> {
  const cookie = await wooliesSession();
  const res = await get("https://www.woolworths.com.au/apis/ui/Search/products", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      Filters: [], IsSpecial: false, Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
      PageNumber: 1, PageSize: 12, SearchTerm: term, SortType: "TraderRelevance",
    }),
  });
  const json = (await res.json()) as { Products: { Products: (WooliesProduct & { ThirdPartyProductInfo?: unknown })[] }[] | null };
  return (json.Products ?? [])
    .map((group) => group.Products[0]!)
    .filter((p) => p && p.Price != null && p.IsAvailable !== false && !p.ThirdPartyProductInfo)
    .map((p) => ({
      store: "woolworths" as const,
      productId: String(p.Stockcode),
      name: p.DisplayName || p.Name,
      size: p.PackageSize,
      price: p.Price!,
      wasPrice: p.WasPrice && p.WasPrice > p.Price! ? p.WasPrice : null,
      ...(parseUnitPrice(p.CupString) ?? { unitPrice: null, unitBasis: null }),
      unitLabel: p.CupString,
      url: `https://www.woolworths.com.au/shop/productdetails/${p.Stockcode}/${p.UrlFriendlyName}`,
      imageUrl: p.MediumImageFile,
    }));
}

async function wooliesIngredients(productId: string): Promise<string | null> {
  const res = await get(`https://www.woolworths.com.au/apis/ui/product/detail/${productId}`, { headers: { cookie: await wooliesSession() } });
  const json = (await res.json()) as { AdditionalAttributes?: { ingredients?: string | null }; Product?: { AdditionalAttributes?: { ingredients?: string | null } } };
  return json.AdditionalAttributes?.ingredients ?? json.Product?.AdditionalAttributes?.ingredients ?? null;
}

// ---------- Coles ----------
let colesBuild: { id: string; at: number } | null = null;
const loadColesBuild = shared(async () => {
  const html = await (await get("https://www.coles.com.au/", { headers: { accept: "text/html" } })).text();
  const id = html.match(/"buildId":"([^"]+)"/)?.[1];
  if (!id) throw new Error("coles: no build id (blocked?)");
  colesBuild = { id, at: Date.now() };
  return id;
});
async function colesBuildId(): Promise<string> {
  if (colesBuild && Date.now() - colesBuild.at < 30 * 60_000) return colesBuild.id;
  return loadColesBuild();
}

type ColesProduct = {
  _type: string; id: number; name: string; brand: string; size: string; availability?: boolean;
  pricing: { now: number; was: number; comparable?: string } | null; imageUris?: { uri: string }[];
};

async function searchColes(term: string): Promise<Offer[]> {
  const build = await colesBuildId();
  const res = await get(`https://www.coles.com.au/_next/data/${build}/en/search/products.json?q=${encodeURIComponent(term)}`);
  const json = (await res.json()) as { pageProps?: { searchResults?: { results?: ColesProduct[] } } };
  return (json.pageProps?.searchResults?.results ?? [])
    .filter((p) => p._type === "PRODUCT" && p.pricing?.now)
    .slice(0, 12)
    .map((p) => {
      const name = `${p.brand} ${p.name}`.trim();
      return {
        store: "coles" as const,
        productId: `${slug(`${p.brand} ${p.name} ${p.size}`)}-${p.id}`,
        name: `${name} ${p.size ?? ""}`.trim(),
        size: p.size ?? null,
        price: p.pricing!.now,
        wasPrice: p.pricing!.was > p.pricing!.now ? p.pricing!.was : null,
        ...(parseUnitPrice(p.pricing!.comparable) ?? { unitPrice: null, unitBasis: null }),
        unitLabel: p.pricing!.comparable ?? null,
        url: `https://www.coles.com.au/product/${slug(`${p.brand} ${p.name} ${p.size}`)}-${p.id}`,
        imageUrl: p.imageUris?.[0]?.uri ? `https://cdn.productimages.coles.com.au/productimages${p.imageUris[0].uri}` : null,
      };
    });
}

async function colesIngredients(productId: string): Promise<string | null> {
  const build = await colesBuildId();
  const res = await get(`https://www.coles.com.au/_next/data/${build}/en/product/${productId}.json`);
  const json = (await res.json()) as { pageProps?: { product?: { additionalInfo?: { title: string; description: string }[] } } };
  return json.pageProps?.product?.additionalInfo?.find((i) => /ingredient/i.test(i.title))?.description ?? null;
}

export const GROCERS: Record<Store, { search: (term: string) => Promise<Offer[]>; ingredients: (productId: string) => Promise<string | null> }> = {
  woolworths: { search: searchWoolworths, ingredients: wooliesIngredients },
  coles: { search: searchColes, ingredients: colesIngredients },
};
