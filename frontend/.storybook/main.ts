import type { StorybookConfig } from "@storybook/react-vite";
import { resolve } from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  viteFinal: async (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve || {};
    const existing = viteConfig.resolve.alias || {};

    2;
    // Clerk mock
    const mockClerk = resolve(__dirname, "./mocks/mockClerkReact.tsx");
    const mockConvex = resolve(__dirname, "./mocks/mockConvexReact.tsx");

    viteConfig.resolve.alias = {
      ...existing,
      // [viteRootSidebar]: mockSidebar,
      "@clerk/clerk-react": mockClerk,
      "convex/react": mockConvex,
    };
    return viteConfig;
  },
};

export default config;
