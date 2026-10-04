import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const RELOAD_KEY = "auth-reload-at";

/**
 * When the Cloudflare Access session expires, API calls get redirected to the
 * Access login on another origin. Reloading the page sends the user through
 * Google sign-in and back. Guarded so a misconfiguration can't loop forever.
 */
function sessionExpired() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - last < 15_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  void dropServiceWorker().finally(() => window.location.reload());
}

/** Unregister the service worker so the next page load is guaranteed to reach Access. */
export async function dropServiceWorker() {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch {
    // Not supported or already gone.
  }
}

const authAwareFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, { ...init, redirect: "manual", credentials: "same-origin" });
  if (res.type === "opaqueredirect" || res.status === 401) sessionExpired();
  return res;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    // The live stream refetches the list and catalog when it reconnects (e.g. app resumed),
    // so focus refetches would only add requests.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url: "/trpc", transformer: superjson }),
      false: splitLink({
        // Price look-ups call the supermarkets: one HTTP request each, so a batch never runs into
        // Cloudflare's per-request limit on outgoing calls.
        condition: (op) => op.path === "prices.compare",
        true: httpLink({ url: "/trpc", transformer: superjson, fetch: authAwareFetch }),
        false: httpBatchLink({ url: "/trpc", transformer: superjson, fetch: authAwareFetch }),
      }),
    }),
  ],
});
