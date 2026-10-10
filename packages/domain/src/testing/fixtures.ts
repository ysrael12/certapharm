import { Participant, type ParticipantRole } from "../accreditation/participant.js";
import type { BatchKey } from "../gs1/batch-key.js";
import type { CountryCode } from "../gs1/country-code.js";
import type { ExpiryDate } from "../gs1/expiry-date.js";
import type { Gtin } from "../gs1/gtin.js";
import type { LegalIdHash } from "../gs1/legal-id-hash.js";
import type { LotNumber, SerialNumber } from "../gs1/lot-serial.js";
import { Batch } from "../origin/batch.js";
import type { WalletAddress } from "../shared/wallet.js";

export const NOW = Date.UTC(2026, 9, 11) / 1000;
export const wallet = (n: string) => n.padEnd(32, "1") as WalletAddress;
export const AUTHORITY = wallet("Authority");
export const GTIN = "02001234567893" as Gtin;
export const LOT = "L2026A" as LotNumber;
export const SERIAL = "0001" as SerialNumber;
export const KEY = "BatchKey1111111111111111111111111111111" as BatchKey;
export const FUTURE = (Date.UTC(2027, 11, 31) / 1000) as ExpiryDate;
const HASH = "ab".repeat(32) as LegalIdHash;

export function participant(name: string, role: ParticipantRole): Participant {
  const r = Participant.accredit({
    authority: AUTHORITY, by: AUTHORITY, wallet: wallet(name), role, displayName: name, legalIdHash: HASH, at: NOW,
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

export function certifiedBatch(issuer = participant("Lab", "MANUFACTURER")): Batch {
  const r = Batch.register(issuer, {
    key: KEY, gtin: GTIN, lot: LOT, expiry: FUTURE, productName: "Demo Amoxicilina 500 mg",
    dosage: "500 mg, 21 capsules", countryOfManufacture: "BR" as CountryCode, now: NOW,
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
