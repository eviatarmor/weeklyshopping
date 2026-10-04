import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    // Chromium can emulate the iPhone viewport; WebKit isn't required.
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
