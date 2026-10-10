import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Gtin, LotNumber, WalletAddress } from "@certapharm/domain";
import { KitBatchKeyDeriver } from "./batch-key.js";
import { loadKeyFile } from "./keys.js";
import { MemoCustodyLedger, decodeMemo, encodeMemo } from "./memo/ledger.js";
import { Keyring } from "./keys.js";
import { SasAccreditationRegistry } from "./sas/accreditation.js";
import { SasCertificateRegistry } from "./sas/issuer.js";
import { TxSender, makeConnection } from "./rpc.js";

const ROOT = resolve(import.meta.dirname, "../../..");
if (existsSync(resolve(ROOT, ".env"))) {
  for (const l of readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]!] ??= m[2]!;
  }
}
const GTIN = "02001234567893" as Gtin;
const LOT = "L2026A" as LotNumber;

describe("KitBatchKeyDeriver", () => {
  it("derives the same address on any machine, and a different one per lot", async () => {
    const d = new KitBatchKeyDeriver();
    expect(await d.derive(GTIN, LOT)).toBe("AKN4Tmk8behARN27vvzici7DkaD4Em9pzmbbHd3iLqvt");
    expect(await d.derive(GTIN, "L2026B" as LotNumber)).not.toBe(await d.derive(GTIN, LOT));
    expect(await d.derive(GTIN, "l2026a" as LotNumber)).not.toBe(await d.derive(GTIN, LOT)); // case-sensitive
  });
});

describe("memo codec", () => {
  const base = { batchKey: "KEY", gtin: "02001234567893", lot: "L2026A", type: "RECEIVED" };
  it("matches the cph1 wire format, within 400 bytes", () => {
    const text = encodeMemo({ ...base, temperatureC: 4.56, locationHash: "9f2c1a0b" });
    expect(text).toMatch(/^cph1 \{.*\}$/);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(400);
    expect(JSON.parse(text.slice(5))).toEqual({ t: "RECEIVED", b: "KEY", g: "02001234567893", l: "L2026A", tc: 4.6, loc: "9f2c1a0b" });
  });
  it("round-trips", () => {
    expect(decodeMemo(encodeMemo({ ...base, temperatureC: 4.5 }), "KEY")).toEqual({ type: "RECEIVED", temperatureC: 4.5 });
  });
  it("rejects foreign, malformed or mismatched entries", () => {
    expect(decodeMemo("hello", "KEY")).toBeNull();
    expect(decodeMemo("cph1 {not json", "KEY")).toBeNull();
    expect(decodeMemo(encodeMemo(base), "OTHER")).toBeNull();
    expect(decodeMemo(`cph1 ${JSON.stringify({ t: "TELEPORTED", b: "KEY" })}`, "KEY")).toBeNull();
  });
  it("drops a malformed location hash instead of trusting it", () => {
    expect(decodeMemo(`cph1 ${JSON.stringify({ t: "SHIPPED", b: "KEY", loc: "not-hex!" })}`, "KEY")).toEqual({ type: "SHIPPED" });
  });
});

// Devnet integration: reads what `cph` wrote with the demo keys. Skipped without RPC_URL or keys.
const labFile = resolve(ROOT, ".keys/labX.json");
const distFile = resolve(ROOT, ".keys/distY.json");
const platformFile = resolve(ROOT, ".keys/platform.json");
const live = !process.env.RPC_URL || ![labFile, distFile, platformFile].every(existsSync);

describe.skipIf(live)("devnet adapters", () => {
  const url = process.env.RPC_URL!;
  const conn = makeConnection(url);
  const clock = { now: () => Math.floor(Date.now() / 1000) };
  const setup = async () => {
    const platform = await loadKeyFile(platformFile);
    const lab = await loadKeyFile(labFile);
    const dist = await loadKeyFile(distFile);
    const sender = new TxSender(conn, platform, url);
    const keyring = new Keyring().add(platform).add(lab).add(dist);
    return { platform, lab, dist, sender, keyring };
  };

  it("finds accredited participants and lists issuers", async () => {
    const { platform, lab, dist, sender } = await setup();
    const reg = new SasAccreditationRegistry(conn.rpc, sender, platform, clock);
    const found = await reg.findMany([lab.address as string as WalletAddress, dist.address as string as WalletAddress]);
    expect([...found.values()].map((p) => p.role).sort()).toEqual(["DISTRIBUTOR", "MANUFACTURER"]);
    expect(await reg.find("11111111111111111111111111111111" as WalletAddress)).toBeNull();
    expect((await reg.listIssuers()).map((p) => p.wallet)).toContain(lab.address);
  }, 30_000);

  it("reads the certificate back with the same fields", async () => {
    const { lab, sender, keyring } = await setup();
    const key = await new KitBatchKeyDeriver().derive(GTIN, LOT);
    const certs = new SasCertificateRegistry(conn.rpc, sender, keyring, clock);
    const rec = await certs.findByBatchKey(key, [lab.address as string as WalletAddress]);
    expect(rec).toMatchObject({ gtin: GTIN, lot: LOT, productName: "Demo Amoxicilina 500 mg", country: "BR", issuer: lab.address });
    expect(await certs.findByBatchKey(key, ["11111111111111111111111111111111" as WalletAddress])).toBeNull();
  }, 30_000);

  it("reads the custody trail with the memo signers as actors", async () => {
    const { lab, dist, sender, keyring } = await setup();
    const key = await new KitBatchKeyDeriver().derive(GTIN, LOT);
    const trail = await new MemoCustodyLedger(conn.rpc, sender, keyring, clock).readTrail(key);
    const by = (a: string) => trail.filter((e) => e.actor === a).map((e) => e.type);
    expect(by(lab.address)).toContain("SHIPPED");
    expect(by(dist.address)).toContain("RECEIVED");
    expect(trail.find((e) => e.type === "RECEIVED")?.temperatureC).toBe(4.6);
  }, 60_000);
});
