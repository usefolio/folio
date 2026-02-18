// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [// Base JS configuration
js.configs.recommended, // TypeScript ESLint configuration
{
  files: ["**/*.{ts,tsx}"],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
    parser: tsParser,
  },
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "@typescript-eslint": tseslint,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    // Disabled this linting funtion, in many cases in the app it incorrectly
    // displays warnings for things that should have reduced dependency arrays
    "react-hooks/exhaustive-deps": "off",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    // Disable base rule as it can report incorrect errors
    "no-unused-vars": "off",
    // Use TypeScript-specific rule instead
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    // Disable no-undef as TypeScript handles this
    "no-undef": "off",
  },
}, // Prettier config last to override conflicting rules
prettierConfig, ...storybook.configs["flat/recommended"]];
