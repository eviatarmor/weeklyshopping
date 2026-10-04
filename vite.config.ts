import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

// Drizzle's durable-sqlite migrations import .sql files; load them as strings.
function sqlAsText(): Plugin {
  return {
    name: "sql-as-text",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith(".sql")) return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  plugins: [
    sqlAsText(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/client/routes",
      generatedRouteTree: "src/client/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      // Send the Access cookie when the browser fetches the manifest.
      useCredentials: true,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Weekly Shopping",
        short_name: "Shopping",
        description: "Shared shopping list and recipes",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // A new deploy takes over open tabs right away instead of waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Page loads always go to the network so Cloudflare Access can check the session
        // (and show the login page when it has expired). Serving a cached shell here
        // left signed-out users stuck on an empty app.
        navigateFallback: null,
        // No HTML in the precache either: Workbox would otherwise answer "/" with the cached index.html.
        globPatterns: ["**/*.{js,css,svg,png,woff2}"],
        // One file, so the Access bypass for sw.js covers the whole worker.
        inlineWorkboxRuntime: true,
        runtimeCaching: [
          {
            // Static recipe data (/data/*.json): show the cached copy instantly, refresh in the background.
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              // Bump the name to drop anything a previous version cached.
              cacheName: "recipe-data-v2",
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              // Only real JSON: never keep an HTML page (login or fallback) in place of data.
              cacheableResponse: { statuses: [200], headers: { "content-type": "application/json" } },
            },
          },
          {
            urlPattern: ({ request, url }) => request.destination === "image" && url.origin !== self.location.origin,
            handler: "CacheFirst",
            options: {
              cacheName: "remote-images",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
