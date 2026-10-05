import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { queryClient, trpcClient, TRPCProvider } from "./lib/trpc";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

/**
 * The list, week plan and household data are kept on the phone, so the app opens and the list
 * works without signal (e.g. at the back of the supermarket). Changes made offline are sent
 * once the connection is back.
 */
const persister = createSyncStoragePersister({ storage: window.localStorage, key: "weeklyshopping-offline", throttleTime: 1000 });
const OFFLINE_QUERIES = new Set(["list", "catalog", "week", "household", "prices", "timers"]);

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Follow the OS light/dark setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  document.documentElement.classList.toggle("dark", dark.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark.matches ? "#1a1f1c" : "#fafcfb");
};
applyTheme();
dark.addEventListener("change", applyTheme);

// The service worker shows timer notifications and keeps a copy of the app for when there is no signal.
if (import.meta.env.PROD) void navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" }).catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60_000,
        // A new deploy may change data shapes: start fresh.
        buster: __BUILD_ID__,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            const path = (q.queryKey[0] as string[] | undefined)?.[0];
            return q.state.status === "success" && path != null && OFFLINE_QUERIES.has(path);
          },
        },
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
