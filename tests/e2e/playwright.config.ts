import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testIgnore: ["node_modules/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_WEB_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "chromium-dark",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: [
          {
            command: "corepack pnpm --filter @astreex/web dev",
            url: "http://localhost:3000",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            command: "corepack pnpm --filter @astreex/admin dev",
            url: "http://localhost:3001",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
})
