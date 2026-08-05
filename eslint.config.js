import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      // Build output at the root and per-app (src/apps/<app>/dist), never linted.
      "**/dist/**",
      "coverage/**",
      "node_modules/**",
      ".husky/**",
      ".agents/**",
      ".claude/**",
      // Hosted-deploy staging dir (built bundles + rendered config, gitignored).
      "infra/gcp/.deploy/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
