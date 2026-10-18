import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: process.env.ATLAS_TEST_URL ?? "http://127.0.0.1:4173",
    viewport: { width: 1600, height: 1000 },
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm preview",
    url: process.env.ATLAS_TEST_URL ?? "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
