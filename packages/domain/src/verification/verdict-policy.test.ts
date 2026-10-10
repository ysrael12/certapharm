import { describe, expect, it } from "vitest";
import type { CustodyEvent } from "../custody/custody.js";
import { FUTURE, GTIN, LOT, NOW, SERIAL, wallet } from "../testing/fixtures.js";
import { evaluateVerdict, type VerificationSnapshot } from "./verdict-policy.js";

const ev = (type: CustodyEvent["type"], t: number, role?: CustodyEvent["actorRole"], extra: Partial<CustodyEvent> = {}): CustodyEvent => ({
  signature: `sig${t}${type}`, type, actor: wallet(role ?? "Stranger"), occurredAt: t, ...(role ? { actorRole: role } : {}), ...extra,
});
const goodTrail = [ev("SHIPPED", 1, "MANUFACTURER"), ev("RECEIVED", 2, "DISTRIBUTOR"), ev("RECEIVED", 3, "PHARMACY")];

const base = (over: Partial<VerificationSnapshot> = {}): VerificationSnapshot => ({
  query: { gtin: GTIN, lot: LOT },
  certificate: {
    issuer: wallet("Lab"), issuerRole: "MANUFACTURER", issuerName: "Laboratório Demo", expiry: FUTURE,
    productName: "Demo Amoxicilina 500 mg", dosage: "500 mg", country: "BR",
  },
  trail: goodTrail, sealsEnabled: false, seal: "NOT_CHECKED", now: NOW, ...over,
});
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("VerdictPolicy", () => {
  it("R1 no certificate -> NOT_RECOGNIZED", () => {
    const r = evaluateVerdict(base({ certificate: undefined }));
    expect(r.verdict).toBe("NOT_RECOGNIZED");
    expect(codes(r)).toEqual(["NO_CERTIFICATE"]);
  });
  it("R1 withdrawn certificate counts as no certificate", () => {
    const c = { ...base().certificate!, withdrawn: true };
    expect(codes(evaluateVerdict(base({ certificate: c })))).toEqual(["NO_CERTIFICATE"]);
  });
  it("R2 issuer not accredited as manufacturer/importer -> NOT_RECOGNIZED", () => {
    for (const issuerRole of [undefined, "PHARMACY", "DISTRIBUTOR"] as const) {
      const c = { ...base().certificate!, issuerRole };
      const r = evaluateVerdict(base({ certificate: c }));
      expect(r.verdict).toBe("NOT_RECOGNIZED");
      expect(codes(r)).toEqual(["ISSUER_NOT_ACCREDITED"]);
    }
    const imp = { ...base().certificate!, issuerRole: "IMPORTER" as const };
    expect(evaluateVerdict(base({ certificate: imp })).verdict).toBe("AUTHENTIC");
  });
  it("R3 serial given, seals enabled, seal NOT_FOUND -> NOT_RECOGNIZED", () => {
    const r = evaluateVerdict(base({ query: { gtin: GTIN, lot: LOT, serial: SERIAL }, sealsEnabled: true, seal: "NOT_FOUND" }));
    expect(r.verdict).toBe("NOT_RECOGNIZED");
    expect(codes(r)).toEqual(["UNIT_NOT_SEALED"]);
  });
  it("R3 does not apply without serial or with seals disabled", () => {
    expect(evaluateVerdict(base({ sealsEnabled: true, seal: "NOT_FOUND" })).verdict).toBe("AUTHENTIC");
    expect(evaluateVerdict(base({ query: { gtin: GTIN, lot: LOT, serial: SERIAL }, sealsEnabled: false, seal: "NOT_FOUND" })).verdict).toBe("AUTHENTIC");
  });
  it("R4 revoked seal -> NOT_RECOGNIZED", () => {
    const r = evaluateVerdict(base({ query: { gtin: GTIN, lot: LOT, serial: SERIAL }, sealsEnabled: true, seal: "REVOKED" }));
    expect(r.verdict).toBe("NOT_RECOGNIZED");
    expect(codes(r)).toEqual(["UNIT_REVOKED"]);
  });
  it("R5 active alert -> AUTHENTIC_WITH_ALERT", () => {
    const r = evaluateVerdict(base({ alert: { level: "RECALL", reasonCode: "ANVISA-DEMO-001", publicNote: "Lote recolhido" } }));
    expect(r.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(r.findings[0]).toEqual({ code: "ALERT_RECALL", severity: "warning", message: "Recall: ANVISA-DEMO-001" });
    expect(r.alert?.publicNote).toBe("Lote recolhido");
  });
  it("R6 expired -> AUTHENTIC_WITH_ALERT", () => {
    const r = evaluateVerdict(base({ now: FUTURE + 1 }));
    expect(r.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(codes(r)).toContain("BATCH_EXPIRED");
  });
  it("R7 custody gap -> AUTHENTIC_WITH_ALERT", () => {
    const r = evaluateVerdict(base({ trail: [ev("RECEIVED", 2, "DISTRIBUTOR")] }));
    expect(r.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(codes(r)).toEqual(["CUSTODY_GAP"]);
  });
  it("R7 cold chain breach only for cold-chain products", () => {
    const trail = [ev("SHIPPED", 1, "MANUFACTURER", { temperatureC: 12 })];
    expect(evaluateVerdict(base({ trail })).verdict).toBe("AUTHENTIC");
    const cold = { ...base().certificate!, coldChain: true };
    const r = evaluateVerdict(base({ trail, certificate: cold }));
    expect(r.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(codes(r)).toEqual(["COLD_CHAIN_BREACH_REPORTED"]);
  });
  it("R7 role not allowed on read becomes a finding, not an exception", () => {
    const r = evaluateVerdict(base({ trail: [ev("SHIPPED", 1, "MANUFACTURER"), ev("DISPENSED", 2, "CARRIER")] }));
    expect(r.verdict).toBe("AUTHENTIC_WITH_ALERT");
    expect(codes(r)).toEqual(["CUSTODY_ROLE_NOT_ALLOWED"]);
  });
  it("R8 otherwise AUTHENTIC with the public batch summary and trail", () => {
    const r = evaluateVerdict(base());
    expect(r.verdict).toBe("AUTHENTIC");
    expect(r.findings).toEqual([]);
    expect(r.batch?.issuer.displayName).toBe("Laboratório Demo");
    expect(r.trail).toHaveLength(3);
  });
  it("non-accredited memo is dropped from the trail but the verdict stays AUTHENTIC", () => {
    const r = evaluateVerdict(base({ trail: [...goodTrail, ev("DISPENSED", 9)] }));
    expect(r.verdict).toBe("AUTHENTIC");
    expect(r.trail).toHaveLength(3);
    expect(r.findings).toEqual([expect.objectContaining({ code: "CUSTODY_SIGNER_NOT_ACCREDITED", severity: "info" })]);
  });
  it("rules run in order: NOT_RECOGNIZED beats an active alert", () => {
    const r = evaluateVerdict(base({ certificate: undefined, alert: { level: "RECALL", reasonCode: "X", publicNote: "n" } }));
    expect(r.verdict).toBe("NOT_RECOGNIZED");
  });
  it("orders the public trail by time", () => {
    const r = evaluateVerdict(base({ trail: [goodTrail[2]!, goodTrail[0]!, goodTrail[1]!] }));
    expect(r.trail.map((e) => e.occurredAt)).toEqual([1, 2, 3]);
  });
});
