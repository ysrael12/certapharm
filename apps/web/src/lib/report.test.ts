import { describe, expect, it } from "vitest";
import { evaluateVerdict, type ExpiryDate, type Gtin, type Instant, type LotNumber, type WalletAddress } from "@certapharm/domain";
import { verifyResponseSchema } from "./contract";
import { toApiResponse, type LoadedReport } from "./report";

const NOW = (Date.UTC(2026, 9, 12) / 1000) as Instant;
const ISSUER = "LabxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXX1" as WalletAddress;
const base = {
  query: { gtin: "02001234567893" as Gtin, lot: "L2026A" as LotNumber },
  sealsEnabled: false, seal: "NOT_CHECKED" as const, now: NOW,
};
const loaded = (report: ReturnType<typeof evaluateVerdict>, serial?: string): LoadedReport => ({
  report, batchKey: "B".repeat(44), query: { gtin: "02001234567893", lot: "L2026A", ...(serial ? { serial } : {}) },
  checkedAt: NOW, cluster: "devnet", explorerTx: (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`,
  explorerAddress: (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
});
const cert = {
  issuer: ISSUER, issuerRole: "MANUFACTURER" as const, issuerName: "Laboratório Demo", attestation: "Att111",
  expiry: (Date.UTC(2027, 11, 31) / 1000) as ExpiryDate, productName: "Demo Amoxicilina 500 mg", dosage: "500 mg", country: "BR",
};

describe("/api/verify contract (spec 05 section 2)", () => {
  it("AUTHENTIC with a trail matches the schema exactly", () => {
    const r = evaluateVerdict({
      ...base, certificate: cert,
      trail: [{ signature: "sig1", type: "SHIPPED", actor: ISSUER, actorRole: "MANUFACTURER", actorName: "Laboratório Demo", occurredAt: NOW - 3600 }],
    });
    const body = toApiResponse(loaded(r));
    expect(verifyResponseSchema.parse(body)).toEqual(body);
    expect(body.verdict).toBe("AUTHENTIC");
    expect(body.batch?.expiry).toBe("2027-12-31");
    expect(body.trail[0]?.temperatureC).toBeNull();
  });

  it("AUTHENTIC_WITH_ALERT carries the alert", () => {
    const r = evaluateVerdict({ ...base, certificate: cert, trail: [], alert: { level: "RECALL", reasonCode: "ANVISA-DEMO-001", publicNote: "Do not use" } });
    const body = toApiResponse(loaded(r));
    expect(verifyResponseSchema.parse(body).alert?.level).toBe("RECALL");
    expect(body.findings[0]?.code).toBe("ALERT_RECALL");
  });

  it("an unknown batch is NOT_RECOGNIZED and still a valid response", () => {
    const body = toApiResponse(loaded(evaluateVerdict({ ...base, trail: [] })));
    expect(verifyResponseSchema.parse(body).verdict).toBe("NOT_RECOGNIZED");
    expect(body.batch).toBeUndefined();
    expect(body.findings[0]?.code).toBe("NO_CERTIFICATE");
  });

  it("a unit query reports the seal as NOT_CHECKED while seals are off", () => {
    const body = toApiResponse(loaded(evaluateVerdict({ ...base, query: { ...base.query, serial: "0001" as never }, certificate: cert, trail: [] }), "0001"));
    expect(verifyResponseSchema.parse(body).unit).toEqual({ serial: "0001", seal: "NOT_CHECKED" });
  });

  it("a sealed unit carries its asset id; an unsealed one is NOT_RECOGNIZED with the unit echoed", () => {
    const sealed = toApiResponse(loaded(evaluateVerdict({
      ...base, query: { ...base.query, serial: "0001" as never }, certificate: cert, trail: [], sealsEnabled: true, seal: "SEALED", sealAssetId: "Asset111",
    }), "0001"));
    expect(verifyResponseSchema.parse(sealed).unit).toEqual({ serial: "0001", seal: "SEALED", assetId: "Asset111" });
    const missing = toApiResponse(loaded(evaluateVerdict({
      ...base, query: { ...base.query, serial: "9999" as never }, certificate: cert, trail: [], sealsEnabled: true, seal: "NOT_FOUND",
    }), "9999"));
    expect(verifyResponseSchema.parse(missing)).toMatchObject({ verdict: "NOT_RECOGNIZED", unit: { serial: "9999", seal: "NOT_FOUND" } });
    expect(missing.findings[0]?.code).toBe("UNIT_NOT_SEALED");
  });

  it("rejects an extra field, so the shape cannot drift silently", () => {
    const body = { ...toApiResponse(loaded(evaluateVerdict({ ...base, trail: [] }))), secret: 1 };
    expect(() => verifyResponseSchema.parse(body)).toThrow();
  });
});
