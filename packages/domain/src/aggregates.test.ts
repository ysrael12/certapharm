import { describe, expect, it } from "vitest";
import { Participant, PARTICIPANT_ROLES } from "./accreditation/participant.js";
import { BatchAlert } from "./alerts/batch-alert.js";
import { CUSTODY_EVENT_TYPES, CustodyTrail, isEventAllowed } from "./custody/custody.js";
import type { ExpiryDate } from "./gs1/expiry-date.js";
import type { LegalIdHash } from "./gs1/legal-id-hash.js";
import { Batch } from "./origin/batch.js";
import { UnitSeal } from "./sealing/unit-seal.js";
import type { CountryCode } from "./gs1/country-code.js";
import { AUTHORITY, FUTURE, GTIN, KEY, LOT, NOW, SERIAL, certifiedBatch, participant, wallet } from "./testing/fixtures.js";

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);
const batchInput = { key: KEY, gtin: GTIN, lot: LOT, expiry: FUTURE, productName: "P", dosage: "D", countryOfManufacture: "BR" as CountryCode, now: NOW };

describe("Participant (P1, P3)", () => {
  const base = { authority: AUTHORITY, by: AUTHORITY, wallet: wallet("W"), role: "PHARMACY" as const, displayName: "Farmácia", legalIdHash: "ab".repeat(32) as LegalIdHash, at: NOW };
  it("only the Platform Authority accredits", () => {
    expect(code(Participant.accredit({ ...base, by: wallet("Other") }))).toBe("NOT_PLATFORM_AUTHORITY");
    expect(code(Participant.accredit(base))).toBe("OK");
  });
  it("validates display name length in bytes", () => {
    expect(code(Participant.accredit({ ...base, displayName: " " }))).toBe("DISPLAY_NAME_INVALID");
    expect(code(Participant.accredit({ ...base, displayName: "é".repeat(25) }))).toBe("DISPLAY_NAME_INVALID");
  });
  it("revoke needs authority and cannot repeat; revoked cannot issue", () => {
    const p = participant("Lab", "MANUFACTURER");
    expect(code(Participant.revoke(p, wallet("Other"), AUTHORITY))).toBe("NOT_PLATFORM_AUTHORITY");
    const r = Participant.revoke(p, AUTHORITY, AUTHORITY);
    expect(r.ok && Participant.canIssueCertificates(r.value)).toBe(false);
    expect(code(Participant.revoke(r.ok ? r.value : p, AUTHORITY, AUTHORITY))).toBe("PARTICIPANT_ALREADY_REVOKED");
  });
});

describe("Batch (B1-B5)", () => {
  it("B1 only active manufacturer/importer", () => {
    expect(code(Batch.register(undefined, batchInput))).toBe("ISSUER_NOT_ACCREDITED");
    expect(code(Batch.register(participant("Pharm", "PHARMACY"), batchInput))).toBe("ISSUER_NOT_ACCREDITED");
    expect(code(Batch.register(participant("Imp", "IMPORTER"), batchInput))).toBe("OK");
  });
  it("B3 expiry must be in the future", () => {
    expect(code(Batch.register(participant("Lab", "MANUFACTURER"), { ...batchInput, expiry: NOW as ExpiryDate }))).toBe("BATCH_EXPIRY_IN_PAST");
  });
  it("field limits", () => {
    const lab = participant("Lab", "MANUFACTURER");
    expect(code(Batch.register(lab, { ...batchInput, productName: "x".repeat(65) }))).toBe("PRODUCT_NAME_INVALID");
    expect(code(Batch.register(lab, { ...batchInput, dosage: "" }))).toBe("DOSAGE_INVALID");
  });
  it("B4 only the issuer withdraws", () => {
    const b = certifiedBatch();
    expect(code(Batch.withdraw(b, wallet("Other")))).toBe("ONLY_ISSUER_CAN_WITHDRAW");
    const w = Batch.withdraw(b, b.issuer);
    expect(w.ok && Batch.statusAt(w.value, NOW)).toBe("WITHDRAWN");
    expect(code(Batch.withdraw(w.ok ? w.value : b, b.issuer))).toBe("BATCH_ALREADY_WITHDRAWN");
  });
  it("B5 EXPIRED is derived", () => {
    const b = certifiedBatch();
    expect(Batch.statusAt(b, NOW)).toBe("CERTIFIED");
    expect(Batch.statusAt(b, b.expiry + 1)).toBe("EXPIRED");
  });
});

describe("Custody write side (C1-C3)", () => {
  const expected: Record<string, string[]> = {
    MANUFACTURER: ["SHIPPED", "STORED"], IMPORTER: ["SHIPPED", "STORED"], DISTRIBUTOR: ["SHIPPED", "RECEIVED", "STORED"],
    CARRIER: ["SHIPPED", "RECEIVED"], PHARMACY: ["RECEIVED", "STORED", "DISPENSED"],
  };
  for (const role of PARTICIPANT_ROLES) {
    for (const type of CUSTODY_EVENT_TYPES) {
      it(`${role} ${type} -> ${expected[role]!.includes(type) ? "allowed" : "rejected"}`, () => {
        expect(isEventAllowed(role, type)).toBe(expected[role]!.includes(type));
      });
    }
  }
  const batch = certifiedBatch();
  const write = (over: object) => CustodyTrail.validateWrite({ actor: participant("Dist", "DISTRIBUTOR"), batch, type: "RECEIVED", now: NOW, ...over });
  it("C1 actor must be accredited and active", () => {
    expect(code(write({ actor: undefined }))).toBe("ACTOR_NOT_ACCREDITED");
    const revoked = Participant.revoke(participant("Dist", "DISTRIBUTOR"), AUTHORITY, AUTHORITY);
    expect(code(write({ actor: revoked.ok ? revoked.value : undefined }))).toBe("ACTOR_NOT_ACCREDITED");
  });
  it("C2 batch must be certified", () => {
    const w = Batch.withdraw(batch, batch.issuer);
    expect(code(write({ batch: w.ok ? w.value : batch }))).toBe("BATCH_NOT_CERTIFIED");
    expect(code(write({ now: batch.expiry + 1 }))).toBe("BATCH_NOT_CERTIFIED");
  });
  it("C3 role x event", () => expect(code(write({ type: "DISPENSED" }))).toBe("EVENT_NOT_ALLOWED_FOR_ROLE"));
  it("temperature bounds", () => {
    expect(code(write({ temperatureC: 61 }))).toBe("TEMPERATURE_OUT_OF_RANGE");
    expect(code(write({ temperatureC: 4.5 }))).toBe("OK");
  });
});

describe("BatchAlert (A1)", () => {
  const input = { authority: AUTHORITY, by: AUTHORITY, batchKey: KEY, level: "RECALL" as const, reasonCode: "ANVISA-RE-1/2026", publicNote: "Recall", now: NOW };
  it("only authority, with length limits", () => {
    expect(code(BatchAlert.raise({ ...input, by: wallet("Other") }))).toBe("NOT_PLATFORM_AUTHORITY");
    expect(code(BatchAlert.raise({ ...input, reasonCode: "x".repeat(33) }))).toBe("REASON_CODE_INVALID");
    expect(code(BatchAlert.raise({ ...input, publicNote: "x".repeat(141) }))).toBe("PUBLIC_NOTE_INVALID");
    expect(code(BatchAlert.raise(input))).toBe("OK");
    expect(code(BatchAlert.assertCanClear(wallet("Other"), AUTHORITY))).toBe("NOT_PLATFORM_AUTHORITY");
  });
});

describe("UnitSeal (U1, U3)", () => {
  const batch = certifiedBatch();
  const seal = { unit: { gtin: GTIN, lot: LOT, serial: SERIAL }, batchKey: KEY, assetId: "a", tree: "t", leafIndex: 0, status: "SEALED" as const };
  it("only the issuer seals a certified batch", () => {
    expect(code(UnitSeal.assertCanSeal(batch, batch.issuer, NOW))).toBe("OK");
    expect(code(UnitSeal.assertCanSeal(batch, wallet("Other"), NOW))).toBe("ONLY_ISSUER_CAN_SEAL");
    expect(code(UnitSeal.assertCanSeal(batch, batch.issuer, batch.expiry + 1))).toBe("BATCH_NOT_CERTIFIED");
  });
  it("revoke", () => {
    expect(code(UnitSeal.revoke(seal, batch, wallet("Other")))).toBe("ONLY_ISSUER_CAN_SEAL");
    const r = UnitSeal.revoke(seal, batch, batch.issuer);
    expect(r.ok && r.value.status).toBe("REVOKED");
    expect(code(UnitSeal.revoke(r.ok ? r.value : seal, batch, batch.issuer))).toBe("UNIT_ALREADY_REVOKED");
  });
});
