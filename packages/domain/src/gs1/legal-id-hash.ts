import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import { sha256Hex } from "../shared/sha256.js";

/** SHA-256 (hex) of the CNPJ digits. The raw CNPJ never goes on-chain. */
export type LegalIdHash = string & { readonly __brand: "LegalIdHash" };
export const LegalIdHash = {
  fromCnpj(raw: string): Result<LegalIdHash, DomainError> {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 14 ? ok(sha256Hex(digits) as LegalIdHash) : fail("LEGAL_ID_INVALID", "CNPJ must have 14 digits");
  },
  fromHex(hex: string): Result<LegalIdHash, DomainError> {
    return /^[0-9a-f]{64}$/.test(hex) ? ok(hex as LegalIdHash) : fail("LEGAL_ID_INVALID", "Hash must be 64 lowercase hex chars");
  },
};
