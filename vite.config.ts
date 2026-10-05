import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

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
  // Changes with every build; used to drop offline data saved by an older version.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
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
  ],
});
