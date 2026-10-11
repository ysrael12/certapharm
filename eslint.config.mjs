import js from "@eslint/js";
import tseslint from "typescript-eslint";

const sdkPatterns = ["@solana/*", "@solana-program/*", "sas-lib", "@metaplex-foundation/*"];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/next-env.d.ts", "apps/web/next.config.mjs", "design/**", "SKILLS/**", ".claude/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/domain/**/*.ts", "packages/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: sdkPatterns }],
    },
  },
);
