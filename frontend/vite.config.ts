/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { configDefaults } from "vitest/config";
import path from "path";

// https://vite.dev/config/
// import { fileURLToPath } from "node:url";
// import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
// const dirname =
//   typeof __dirname !== "undefined"
//     ? __dirname
//     : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
// Storybook tests disabled for now
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    sourcemap: false,
    outDir: "dist",
    assetsDir: "assets",
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  server: {
    host: true,
    // This allows external connections
    port: 5173,
    // Allow bs-local.com
    hmr: {
      host: "bs-local.com",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    exclude: [...configDefaults.exclude, "tests/**/*.spec.ts"],
    // workspace: [
    //   {
    //     extends: true,
    //     plugins: [
    //       // The plugin will run tests for the stories defined in your Storybook config
    //       // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
    //       storybookTest({
    //         configDir: path.join(dirname, ".storybook"),
    //       }),
    //     ],
    //     test: {
    //       name: "storybook",
    //       browser: {
    //         enabled: false,
    //         headless: true,
    //         provider: "playwright",
    //         instances: [
    //           {
    //             browser: "chromium",
    //           },
    //         ],
    //       },
    //       setupFiles: [".storybook/vitest.setup.ts"],
    //     },
    //   },
    // ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
