import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { registerSW } from "virtual:pwa-register";
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

if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    // Installed PWAs can stay open for days: look for a new deploy hourly and whenever the app comes back to the foreground.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
  // When a new service worker replaces the old one, reload once so the page runs the new code.
  // (Skip the very first install: nothing controlled the page before, so it is already current.)
  let hadController = Boolean(navigator.serviceWorker?.controller);
  let reloaded = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
