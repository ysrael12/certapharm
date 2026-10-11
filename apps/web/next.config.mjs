import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

// Next only reads apps/web/.env. The workspace keeps one .env at the root (shared with the CLI), so load it here, before any route runs.
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2];
  }
}

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  // Solana SDKs stay as plain Node modules on the server; they are never bundled for the browser.
  serverExternalPackages: ["@solana/kit", "sas-lib", "@certapharm/runtime", "@certapharm/infra-solana"],
  poweredByHeader: false,
};
