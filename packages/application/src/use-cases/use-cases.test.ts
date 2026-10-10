import { describe, expect, it } from "vitest";
import type { Result, WalletAddress } from "@certapharm/domain";
import { makeWorld } from "../testing/fakes.js";
import { AccreditParticipant } from "./accredit-participant.js";
import { BootstrapPlatform } from "./bootstrap-platform.js";
import { OnboardIssuer } from "./onboard-issuer.js";
import { RecordCustodyEvent } from "./record-custody-event.js";
import { RegisterBatch } from "./register-batch.js";

const w = (n: string) => n.replace(/[0OIl]/g, "x").padEnd(32, "1") as WalletAddress; // valid base58
const PLATFORM = w("Platform"), LAB = w("LabX"), DIST = w("DistY"), PHARMA = w("PharmaW"), CARRIER = w("CarrierZ");
const CNPJ = "12345678000199";
const code = (r: Result<unknown, { code: string }>) => (r.ok ? "OK" : r.error.code);

function setup() {
  const x = makeWorld();
  const accredit = new AccreditParticipant(x.accreditation, PLATFORM, x.clock, x.bus);
  const onboard = new OnboardIssuer(x.accreditation, x.onboarding);
  const register = new RegisterBatch(x.accreditation, x.certificates, x.keys, x.clock, x.bus, "https://certapharm.test");
  const record = new RecordCustodyEvent(x.accreditation, x.certificates, x.custody, x.keys, x.clock, x.bus);
  const acc = (wallet: WalletAddress, role: string, name = "Nome") =>
    accredit.execute({ by: PLATFORM, wallet, role, displayName: name, cnpj: CNPJ });
  const batch = { issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", expiry: "2027-12-31", productName: "Demo Amoxicilina 500 mg", dosage: "500 mg", country: "BR" };
  return { x, accredit, onboard, register, record, acc, batch };
}

describe("UC1 BootstrapPlatform", () => {
  it("second run sends no transactions and returns the same addresses", async () => {
    const x = makeWorld();
    const uc = new BootstrapPlatform(x.platform);
    const first = await uc.execute();
    const before = x.chain.txCount;
    const second = await uc.execute();
    expect(first.ok && second.ok).toBe(true);
    expect(x.chain.txCount).toBe(before);
    if (first.ok && second.ok) {
      expect(second.value.signatures).toEqual([]);
      expect(second.value.platformCredential).toBe(first.value.platformCredential);
    }
  });
});

describe("UC2 AccreditParticipant", () => {
  it("accredits a new wallet as DISTRIBUTOR", async () => {
    const { x, acc } = setup();
    expect(code(await acc(DIST, "DISTRIBUTOR"))).toBe("OK");
    const found = await x.accreditation.find(DIST);
    expect(found?.role).toBe("DISTRIBUTOR");
    expect(x.bus.published.map((e) => e.type)).toEqual(["ParticipantAccredited"]);
  });
  it("ALREADY_ACCREDITED and no tx on the second call", async () => {
    const { x, acc } = setup();
    await acc(DIST, "DISTRIBUTOR");
    const before = x.chain.txCount;
    expect(code(await acc(DIST, "DISTRIBUTOR"))).toBe("ALREADY_ACCREDITED");
    expect(x.chain.txCount).toBe(before);
  });
  it("only the Platform Authority signs (P1), role and CNPJ are validated", async () => {
    const { x, accredit, acc } = setup();
    expect(code(await accredit.execute({ by: LAB, wallet: DIST, role: "DISTRIBUTOR", displayName: "N", cnpj: CNPJ }))).toBe("NOT_PLATFORM_AUTHORITY");
    expect(code(await acc(DIST, "WIZARD"))).toBe("ROLE_INVALID");
    expect(code(await accredit.execute({ by: PLATFORM, wallet: DIST, role: "DISTRIBUTOR", displayName: "N", cnpj: "123" }))).toBe("CNPJ_INVALID");
    expect(x.chain.txCount).toBe(0);
  });
  it("the raw CNPJ never reaches the registry or the events", async () => {
    const { x, acc } = setup();
    await acc(DIST, "DISTRIBUTOR");
    expect(JSON.stringify([...x.chain.participants.values()])).not.toContain(CNPJ);
    expect(JSON.stringify(x.bus.published)).not.toContain(CNPJ);
  });
});

describe("UC3 OnboardIssuer", () => {
  it("an accredited PHARMACY cannot onboard as issuer", async () => {
    const { onboard, acc } = setup();
    await acc(PHARMA, "PHARMACY");
    expect(code(await onboard.execute({ issuer: { address: PHARMA } }))).toBe("NOT_AN_ISSUER");
  });
  it("a non-accredited wallet cannot either", async () => {
    const { onboard } = setup();
    expect(code(await onboard.execute({ issuer: { address: LAB } }))).toBe("NOT_AN_ISSUER");
  });
  it("is idempotent for a manufacturer", async () => {
    const { x, onboard, acc } = setup();
    await acc(LAB, "MANUFACTURER");
    const first = await onboard.execute({ issuer: { address: LAB } });
    const before = x.chain.txCount;
    const second = await onboard.execute({ issuer: { address: LAB } });
    expect(first.ok && first.value.signatures.length).toBe(2);
    expect(second.ok && second.value.signatures).toEqual([]);
    expect(x.chain.txCount).toBe(before);
  });
});

describe("UC4 RegisterBatch", () => {
  it("certifies a batch and returns the verify URL", async () => {
    const { x, register, acc, batch } = setup();
    await acc(LAB, "MANUFACTURER");
    const r = await register.execute(batch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifyUrl).toBe("https://certapharm.test/01/02001234567893/10/L2026A");
      expect(r.value.batch.certificate).toMatch(/^att:/);
    }
    expect(x.chain.certificates.size).toBe(1);
    expect(x.bus.published.at(-1)?.type).toBe("BatchCertified");
  });
  it("ISSUER_NOT_ACCREDITED and no tx for an unknown wallet or a PHARMACY", async () => {
    const { x, register, acc, batch } = setup();
    expect(code(await register.execute(batch))).toBe("ISSUER_NOT_ACCREDITED");
    await acc(LAB, "PHARMACY");
    expect(code(await register.execute(batch))).toBe("ISSUER_NOT_ACCREDITED");
    expect(x.chain.certificates.size).toBe(0);
  });
  it("BATCH_ALREADY_CERTIFIED on the same (gtin, lot) twice, even with an unnormalized GTIN", async () => {
    const { x, register, acc, batch } = setup();
    await acc(LAB, "MANUFACTURER");
    await register.execute(batch);
    const before = x.chain.txCount;
    expect(code(await register.execute({ ...batch, gtin: "02001234567893" }))).toBe("BATCH_ALREADY_CERTIFIED");
    expect(x.chain.txCount).toBe(before);
  });
  it("B2 also holds across issuers", async () => {
    const { register, acc, batch } = setup();
    await acc(LAB, "MANUFACTURER");
    await acc(w("ImporterQ"), "IMPORTER");
    await register.execute(batch);
    expect(code(await register.execute({ ...batch, issuer: { address: w("ImporterQ") } }))).toBe("BATCH_ALREADY_CERTIFIED");
  });
  it("fails fast on value-object and expiry errors", async () => {
    const { x, register, acc, batch } = setup();
    await acc(LAB, "MANUFACTURER");
    expect(code(await register.execute({ ...batch, gtin: "2001234567894" }))).toBe("GTIN_BAD_CHECK_DIGIT");
    expect(code(await register.execute({ ...batch, lot: "a b" }))).toBe("LOT_INVALID");
    expect(code(await register.execute({ ...batch, expiry: "2020-01-01" }))).toBe("BATCH_EXPIRY_IN_PAST");
    expect(code(await register.execute({ ...batch, country: "BRA" }))).toBe("COUNTRY_INVALID");
    expect(x.chain.txCount).toBe(1); // only the accreditation
  });
});

describe("UC5 RecordCustodyEvent", () => {
  async function certified() {
    const s = setup();
    await s.acc(LAB, "MANUFACTURER");
    await s.acc(DIST, "DISTRIBUTOR");
    await s.acc(CARRIER, "CARRIER");
    await s.acc(PHARMA, "PHARMACY");
    await s.register.execute(s.batch);
    return s;
  }
  const ev = (actor: WalletAddress, type: string, extra = {}) => ({ actor: { address: actor }, gtin: "02001234567893", lot: "L2026A", type, ...extra });

  it("records RECEIVED then SHIPPED in order with the distributor as actor", async () => {
    const { x, record, keys } = await certified().then((s) => ({ ...s, keys: s.x.keys }));
    expect(code(await record.execute(ev(DIST, "RECEIVED")))).toBe("OK");
    x.chain.now += 60;
    expect(code(await record.execute(ev(DIST, "SHIPPED")))).toBe("OK");
    const key = await keys.derive("02001234567893" as never, "L2026A" as never);
    const trail = await x.custody.readTrail(key);
    expect(trail.map((e) => e.type)).toEqual(["RECEIVED", "SHIPPED"]);
    expect(trail.every((e) => e.actor === DIST)).toBe(true);
  });
  it("PHARMACY cannot record SHIPPED", async () => {
    const { record } = await certified();
    expect(code(await record.execute(ev(PHARMA, "SHIPPED")))).toBe("EVENT_NOT_ALLOWED_FOR_ROLE");
  });
  it("ACTOR_NOT_ACCREDITED for a stranger, even on an uncertified batch", async () => {
    const { record } = await certified();
    expect(code(await record.execute(ev(w("Stranger"), "RECEIVED")))).toBe("ACTOR_NOT_ACCREDITED");
    expect(code(await record.execute({ ...ev(w("Stranger"), "RECEIVED"), lot: "NOPE" }))).toBe("ACTOR_NOT_ACCREDITED");
  });
  it("BATCH_NOT_CERTIFIED when unknown or expired", async () => {
    const { x, record } = await certified();
    expect(code(await record.execute({ ...ev(DIST, "RECEIVED"), lot: "NOPE" }))).toBe("BATCH_NOT_CERTIFIED");
    x.chain.now = Date.UTC(2028, 0, 2) / 1000;
    expect(code(await record.execute(ev(DIST, "RECEIVED")))).toBe("BATCH_NOT_CERTIFIED");
  });
  it("validates type and temperature, and sends no tx on failure", async () => {
    const { x, record } = await certified();
    const before = x.chain.txCount;
    expect(code(await record.execute(ev(DIST, "TELEPORTED")))).toBe("EVENT_TYPE_INVALID");
    expect(code(await record.execute(ev(CARRIER, "RECEIVED", { temperatureC: 99 })))).toBe("TEMPERATURE_OUT_OF_RANGE");
    expect(x.chain.txCount).toBe(before);
  });
  it("hashes the site id to 8 hex chars", async () => {
    const { x, record } = await certified();
    await record.execute(ev(CARRIER, "RECEIVED", { temperatureC: 4.6, siteId: "Dock 7" }));
    const key = await x.keys.derive("02001234567893" as never, "L2026A" as never);
    const [e] = await x.custody.readTrail(key);
    expect(e?.locationHash).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(e)).not.toContain("Dock 7");
    expect(e?.temperatureC).toBe(4.6);
  });
});
