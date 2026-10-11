import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Which Merkle tree each issuer's seals live in. A seal only counts when it sits in the issuer's own tree, so this map is what
 * stops anyone from minting a lookalike asset into an issuer's wallet. Tree addresses are public.
 * Read order: `SEAL_TREES` (JSON, for hosts with no writable disk), then the committed file.
 */
export class SealTreeRegistry {
  constructor(private readonly file: string, private readonly envJson: string | undefined = undefined) {}

  private read(): Record<string, string> {
    const fromFile = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as Record<string, string>) : {};
    const fromEnv = this.envJson ? (JSON.parse(this.envJson) as Record<string, string>) : {};
    return { ...fromFile, ...fromEnv };
  }

  get(issuer: string): string | undefined {
    return this.read()[issuer];
  }

  set(issuer: string, tree: string): void {
    const current = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as Record<string, string>) : {};
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify({ ...current, [issuer]: tree }, null, 2)}\n`);
  }
}
