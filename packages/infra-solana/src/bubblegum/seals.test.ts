import { describe, expect, it } from "vitest";
import type { Gtin, LotNumber, SerialNumber, WalletAddress } from "@certapharm/domain";
import { BubblegumSeals, sealName } from "./seals.js";
import type { SealTreeRegistry } from "./trees.js";

const ISSUER = "HLzKijw9z9pc3UknA4kDkCaUahi2CyGoSm56jBKNo28j";
const TREE = "6FgdbGCuNZU5ygfniVSZPeu4VBRhV6UtACs5CiXgnfRa";
const unit = (serial: string) => ({ gtin: "02001234567893" as Gtin, lot: "L2026D" as LotNumber, serial: serial as SerialNumber });

const asset = (name: string, tree: string, burnt = false) => ({ id: `id-${name}`, burnt, compression: { compressed: true, tree }, content: { metadata: { name } } });

/** A reader whose DAS answers are canned, so the trust rules can be tested offline. */
function readerWith(items: ReturnType<typeof asset>[]) {
  const trees = { get: (i: string) => (i === ISSUER ? TREE : undefined), set: () => undefined } as unknown as SealTreeRegistry;
  const seals = new BubblegumSeals({
    rpcUrl: "http://localhost:1", publicBaseUrl: "https://x.test", explorerTx: (s) => s, trees, payer: ISSUER, secretOf: () => new Uint8Array(64),
  });
  (seals as unknown as { umi: { rpc: unknown } }).umi.rpc = { getAssetsByOwner: async () => ({ items }) };
  return seals;
}

describe("BubblegumSeals.find", () => {
  it("finds a unit sealed into the issuer's own tree", async () => {
    const r = await readerWith([asset("CPH L2026D-0001", TREE)]).find(ISSUER as WalletAddress, unit("0001"));
    expect(r).toEqual({ status: "SEALED", assetId: "id-CPH L2026D-0001" });
  });

  it("ignores a lookalike asset minted into the issuer's wallet from someone else's tree", async () => {
    const r = await readerWith([asset("CPH L2026D-7777", "AnotherTree11111111111111111111111111111111")]).find(ISSUER as WalletAddress, unit("7777"));
    expect(r.status).toBe("NOT_FOUND");
  });

  it("ignores burnt assets and serials nobody sealed", async () => {
    const seals = readerWith([asset("CPH L2026D-0002", TREE, true)]);
    expect((await seals.find(ISSUER as WalletAddress, unit("0002"))).status).toBe("NOT_FOUND");
    expect((await seals.find(ISSUER as WalletAddress, unit("0003"))).status).toBe("NOT_FOUND");
  });

  it("an issuer with no tree has no seals", async () => {
    const r = await readerWith([asset("CPH L2026D-0001", TREE)]).find("Other1111111111111111111111111111111111111" as WalletAddress, unit("0001"));
    expect(r.status).toBe("NOT_FOUND");
  });
});

describe("sealName", () => {
  it("is CPH lot-serial and stays within 32 bytes", () => {
    expect(sealName("L2026D", "0001")).toBe("CPH L2026D-0001");
    expect(() => sealName("L".repeat(20), "S".repeat(20))).toThrow(/32 bytes/);
  });
});
