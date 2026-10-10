import js from "@eslint/js";
import tseslint from "typescript-eslint";

const sdkPatterns = ["@solana/*", "@solana-program/*", "sas-lib", "@metaplex-foundation/*"];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "SKILLS/**", ".claude/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/domain/**/*.ts", "packages/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: sdkPatterns }],
    },
  },
);
