import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { configDefaults } from "vitest/config";
import path from "path";

// Dedicated config for memory tests
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    exclude: [...configDefaults.exclude, "tests/**/*.spec.ts"],
    include: ["**/*.memory.test.*"],
    poolOptions: {
      threads: {
        singleThread: true,
        execArgv: ["--expose-gc"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
