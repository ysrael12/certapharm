import { describe, expect, it } from "vitest";
import type { Result, WalletAddress } from "@certapharm/domain";
import { makeWorld } from "../testing/fakes.js";
import { AccreditParticipant } from "./accredit-participant.js";
import { RaiseAlert } from "./raise-alert.js";
import { RecordCustodyEvent } from "./record-custody-event.js";
import { RegisterBatch } from "./register-batch.js";
import { VerifyProduct } from "./verify-product.js";

const w = (n: string) => n.replace(/[0OIl]/g, "x").padEnd(32, "1") as WalletAddress;
const PLATFORM = w("Platform"), LAB = w("LabX"), DIST = w("DistY"), PHARMA = w("PharmaW"), CARRIER = w("CarrierZ"), RANDOM = w("Random");
const CNPJ = "12345678000199";
const LINK = "https://certapharm.test/01/02001234567893/10/L2026A";

async function world() {
  const x = makeWorld();
  const accredit = new AccreditParticipant(x.accreditation, PLATFORM, x.clock, x.bus);
  const register = new RegisterBatch(x.accreditation, x.certificates, x.keys, x.clock, x.bus, "https://certapharm.test");
  const record = new RecordCustodyEvent(x.accreditation, x.certificates, x.custody, x.keys, x.clock, x.bus);
  const alerts = new RaiseAlert(x.alerts, x.keys, PLATFORM, x.clock);
  const verify = () => new VerifyProduct(x.accreditation, x.certificates, x.custody, x.alerts, x.keys, x.clock);
  const ok = (r: Result<unknown, { code: string }>) => { if (!r.ok) throw new Error(r.error.code); };
  for (const [wallet, role] of [[LAB, "MANUFACTURER"], [DIST, "DISTRIBUTOR"], [PHARMA, "PHARMACY"], [CARRIER, "CARRIER"]] as const) {
    ok(await accredit.execute({ by: PLATFORM, wallet, role, displayName: role, cnpj: CNPJ }));
  }
  ok(await register.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L2026A", expiry: "2027-12-31", productName: "Demo", dosage: "500 mg", country: "BR" }));
  const step = async (actor: WalletAddress, type: string, temperatureC?: number) => {
    x.chain.now += 60;
    ok(await record.execute({ actor: { address: actor }, gtin: "2001234567893", lot: "L2026A", type, ...(temperatureC !== undefined ? { temperatureC } : {}) }));
  };
  return { x, alerts, verify, step, ok };
}

const fullTrail = async (s: Awaited<ReturnType<typeof world>>) => {
  await s.step(LAB, "SHIPPED"); await s.step(CARRIER, "RECEIVED", 4.6); await s.step(CARRIER, "SHIPPED");
  await s.step(DIST, "RECEIVED"); await s.step(DIST, "SHIPPED"); await s.step(PHARMA, "RECEIVED"); await s.step(PHARMA, "DISPENSED");
};

describe("UC6 VerifyProduct", () => {
  it("certified batch with an accredited trail is AUTHENTIC", async () => {
    const s = await world();
    await fullTrail(s);
    const r = await s.verify().execute({ link: LINK });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC");
    expect(r.ok && r.value.trail).toHaveLength(7);
    expect(r.ok && r.value.batch?.issuer.displayName).toBe("MANUFACTURER");
  });

  it("a RECALL alert gives AUTHENTIC_WITH_ALERT with ALERT_RECALL", async () => {
    const s = await world();
    await fullTrail(s);
    s.ok(await s.alerts.raise({ by: PLATFORM, gtin: "2001234567893", lot: "L2026A", level: "RECALL", reasonCode: "ANVISA-DEMO-001", publicNote: "Recall" }));
    const r = await s.verify().execute({ link: LINK });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(r.ok && r.value.findings.map((f) => f.code)).toContain("ALERT_RECALL");
  });

  it("an unknown lot is NOT_RECOGNIZED / NO_CERTIFICATE, never an error", async () => {
    const s = await world();
    const r = await s.verify().execute({ link: "https://certapharm.test/01/02001234567893/10/L2026X" });
    expect(r.ok && r.value.verdict).toBe("NOT_RECOGNIZED");
    expect(r.ok && r.value.findings[0]?.code).toBe("NO_CERTIFICATE");
  });

  it("a certificate whose issuer lost its accreditation is NOT_RECOGNIZED", async () => {
    const s = await world();
    await s.x.accreditation.revoke(LAB);
    const r = await s.verify().execute({ link: LINK });
    expect(r.ok && r.value.verdict).toBe("NOT_RECOGNIZED");
  });

  it("a memo from a random wallet is dropped, finding present, verdict unchanged", async () => {
    const s = await world();
    await fullTrail(s);
    await s.x.custody.record({ address: RANDOM }, { batchKey: await s.x.keys.derive("02001234567893" as never, "L2026A" as never), gtin: "02001234567893" as never, lot: "L2026A" as never, type: "DISPENSED" });
    const r = await s.verify().execute({ link: LINK });
    expect(r.ok && r.value.verdict).toBe("AUTHENTIC");
    expect(r.ok && r.value.trail).toHaveLength(7);
    expect(r.ok && r.value.findings.map((f) => f.code)).toContain("CUSTODY_SIGNER_NOT_ACCREDITED");
  });

  it("an unparseable link is LINK_UNPARSEABLE", async () => {
    const s = await world();
    const r = await s.verify().execute({ link: "hello" });
    expect(!r.ok && r.error.code).toBe("LINK_UNPARSEABLE");
  });

  it("reports are cached for 15 s per (gtin, lot, serial)", async () => {
    const s = await world();
    const v = s.verify();
    const first = await v.execute({ link: LINK });
    s.ok(await s.alerts.raise({ by: PLATFORM, gtin: "2001234567893", lot: "L2026A", level: "RECALL", reasonCode: "X", publicNote: "n" }));
    const second = await v.execute({ link: LINK });
    expect(second.ok && second.value.verdict).toBe(first.ok && first.value.verdict);
  });
});

describe("UC8 RaiseAlert", () => {
  it("only the Platform Authority raises or clears", async () => {
    const s = await world();
    const bad = await s.alerts.raise({ by: LAB, gtin: "2001234567893", lot: "L2026A", level: "RECALL", reasonCode: "X", publicNote: "n" });
    expect(!bad.ok && bad.error.code).toBe("NOT_PLATFORM_AUTHORITY");
    const clear = await s.alerts.clear({ by: LAB, gtin: "2001234567893", lot: "L2026A" });
    expect(!clear.ok && clear.error.code).toBe("NOT_PLATFORM_AUTHORITY");
  });
  it("rejects an unknown level", async () => {
    const s = await world();
    const r = await s.alerts.raise({ by: PLATFORM, gtin: "2001234567893", lot: "L2026A", level: "PANIC", reasonCode: "X", publicNote: "n" });
    expect(!r.ok && r.error.code).toBe("ALERT_LEVEL_INVALID");
  });
});
