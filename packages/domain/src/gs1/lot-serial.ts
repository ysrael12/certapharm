import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";

// GS1 General Specifications, character set 82 (AI 10 and AI 21).
const GS1_CSET = /^[!-"%-/0-9:-?A-Z_a-z]+$/;

export type LotNumber = string & { readonly __brand: "LotNumber" };
export type SerialNumber = string & { readonly __brand: "SerialNumber" };

function gs1String(raw: string): string | undefined {
  const s = raw.trim();
  return s.length >= 1 && s.length <= 20 && GS1_CSET.test(s) ? s : undefined;
}

export const LotNumber = {
  create(raw: string): Result<LotNumber, DomainError> {
    const s = gs1String(raw);
    return s ? ok(s as LotNumber) : fail("LOT_INVALID", "Lot must be 1-20 GS1 AI(10) characters");
  },
};
export const SerialNumber = {
  create(raw: string): Result<SerialNumber, DomainError> {
    const s = gs1String(raw);
    return s ? ok(s as SerialNumber) : fail("SERIAL_INVALID", "Serial must be 1-20 GS1 AI(21) characters");
  },
};
