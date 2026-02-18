import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", // Ensure your tests are in this directory
  reporter: "html",
  // webServer: {
  //   command: "npm run dev",
  //   url: "http://localhost:5173/",
  //   timeout: 60000,
  // },

  globalSetup: "./globalSetup.ts",
  use: {
    extraHTTPHeaders: {
      "X-Vercel-Protection-Bypass":
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
        "L0hdu5qYym2RKKNqGLFqQ3hJJre2uElk",
    },
    storageState: "tests/auth.json",
    browserName: "firefox", // Default browser
    headless: false, // Run headless in CI, headed locally
    viewport: { width: 1280, height: 720 },
    baseURL: process.env.BASE_URL || "http://localhost:5173", // Use env variable if set
    trace: "on", // Capture trace
    screenshot: "on",
  },
});
