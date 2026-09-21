import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  { rules: { "no-unused-vars": ["error", { ignoreRestSiblings: true }] } },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, game: "readonly", canvas: "readonly", ui: "readonly", Hooks: "readonly", foundry: "readonly", CONFIG: "readonly", CONST: "readonly", PIXI: "readonly" },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.jest, ...globals.node, game: "writable", canvas: "writable", ui: "writable", Hooks: "writable", foundry: "writable", CONFIG: "writable", CONST: "writable" } },
  },
  { ignores: ["node_modules/", "docs/"] },
];
