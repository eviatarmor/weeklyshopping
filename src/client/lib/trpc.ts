import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
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
  window.location.reload();
}

const authAwareFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, { ...init, redirect: "manual", credentials: "same-origin" });
  if (res.type === "opaqueredirect" || res.status === 401) sessionExpired();
  return res;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url: "/trpc", transformer: superjson }),
      false: httpBatchLink({ url: "/trpc", transformer: superjson, fetch: authAwareFetch }),
    }),
  ],
});
