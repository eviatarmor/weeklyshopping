import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { queryClient, trpcClient, TRPCProvider } from "./lib/trpc";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

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

// The service worker only shows timer notifications; it caches nothing (and clears what older versions cached).
if (import.meta.env.PROD) void navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
void globalThis.caches?.keys().then((keys) => keys.forEach((key) => void caches.delete(key)));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
