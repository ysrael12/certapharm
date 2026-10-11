import { describe, expect, it } from "vitest";
import type { Result, WalletAddress } from "@certapharm/domain";
import { makeWorld } from "../testing/fakes.js";
import { AccreditParticipant } from "./accredit-participant.js";
import { RegisterBatch } from "./register-batch.js";
import { SealUnits } from "./seal-units.js";
import { VerifyProduct } from "./verify-product.js";

const w = (n: string) => n.replace(/[0OIl]/g, "x").padEnd(32, "1") as WalletAddress;
const PLATFORM = w("Platform"), LAB = w("LabX"), OTHER_LAB = w("LabY");
const CNPJ = "12345678000199";
const LINK = (serial: string) => `https://certapharm.test/01/02001234567893/10/L2026A/21/${serial}`;

async function world() {
  const x = makeWorld();
  const ok = (r: Result<unknown, { code: string }>) => { if (!r.ok) throw new Error(r.error.code); };
  const accredit = new AccreditParticipant(x.accreditation, PLATFORM, x.clock, x.bus);
  const register = new RegisterBatch(x.accreditation, x.certificates, x.keys, x.clock, x.bus, "https://certapharm.test");
  ok(await accredit.execute({ by: PLATFORM, wallet: LAB, role: "MANUFACTURER", displayName: "Lab", cnpj: CNPJ }));
  ok(await accredit.execute({ by: PLATFORM, wallet: OTHER_LAB, role: "MANUFACTURER", displayName: "Other", cnpj: CNPJ }));
  ok(await register.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", expiry: "2027-12-31", productName: "Demo", dosage: "500 mg", country: "BR" }));
  const seal = new SealUnits(x.accreditation, x.certificates, x.seals, x.seals, x.keys, x.clock);
  const verifyWithSeals = () => new VerifyProduct(x.accreditation, x.certificates, x.custody, x.alerts, x.keys, x.clock, x.seals);
  return { x, seal, verifyWithSeals };
}

describe("UC7 SealUnits", () => {
  it("seals every serial and a second run sends no transaction", async () => {
    const s = await world();
    const first = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001", "0002", "0003"] });
    expect(first.ok && first.value.sealed.map((u) => u.serial)).toEqual(["0001", "0002", "0003"]);
    const before = s.x.chain.txCount;
    const again = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001", "0002", "0003"] });
    expect(again.ok && again.value.skipped).toEqual(["0001", "0002", "0003"]);
    expect(s.x.chain.txCount).toBe(before);
  });

  it("only the batch issuer can seal (U3)", async () => {
    const s = await world();
    const r = await s.seal.execute({ issuer: { address: OTHER_LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001"] });
    expect(!r.ok && r.error.code).toBe("ONLY_ISSUER_CAN_SEAL");
  });

  it("an uncertified batch cannot be sealed (U1)", async () => {
    const s = await world();
    const r = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L9999", serials: ["0001"] });
    expect(!r.ok && r.error.code).toBe("BATCH_NOT_CERTIFIED");
  });

  it("rejects empty and oversized calls, and reports a bad serial without stopping the rest", async () => {
    const s = await world();
    const empty = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: [] });
    expect(!empty.ok && empty.error.code).toBe("SERIALS_EMPTY");
    const many = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: Array.from({ length: 51 }, (_, i) => `S${i}`) });
    expect(!many.ok && many.error.code).toBe("TOO_MANY_SERIALS");
    const mixed = await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001", "bad serial!", "0002"] });
    expect(mixed.ok && mixed.value.sealed).toHaveLength(2);
    expect(mixed.ok && mixed.value.failed[0]?.code).toBe("SERIAL_INVALID");
  });
});

describe("UC6 with unit seals", () => {
  it("a sealed serial is AUTHENTIC and carries the asset id", async () => {
    const s = await world();
    await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001"] });
    const r = await s.verifyWithSeals().execute({ link: LINK("0001") });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC");
    expect(r.ok && r.value.unit).toEqual({ serial: "0001", seal: "SEALED", assetId: "asset:02001234567893:L2026A:0001" });
  });

  it("a serial nobody sealed is NOT_RECOGNIZED / UNIT_NOT_SEALED (R3)", async () => {
    const s = await world();
    await s.seal.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", serials: ["0001"] });
    const r = await s.verifyWithSeals().execute({ link: LINK("9999") });
    expect(r.ok && r.value.verdict).toBe("NOT_RECOGNIZED");
    expect(r.ok && r.value.findings[0]?.code).toBe("UNIT_NOT_SEALED");
  });

  it("without a seal reader the serial is not checked and the batch verdict stands", async () => {
    const s = await world();
    const plain = new VerifyProduct(s.x.accreditation, s.x.certificates, s.x.custody, s.x.alerts, s.x.keys, s.x.clock);
    const r = await plain.execute({ link: LINK("9999") });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC");
    expect(r.ok && r.value.unit?.seal).toBe("NOT_CHECKED");
  });

  it("a batch-level link never asks for a seal", async () => {
    const s = await world();
    const r = await s.verifyWithSeals().execute({ link: "https://certapharm.test/01/02001234567893/10/L2026A" });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC");
    expect(r.ok && r.value.unit).toBeUndefined();
  });
});
