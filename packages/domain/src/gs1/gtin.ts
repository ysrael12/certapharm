import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";

export type Gtin = string & { readonly __brand: "Gtin" };

/** GS1 mod-10: from the right of the body, weights 3,1,3,1... */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export const Gtin = {
  create(raw: string): Result<Gtin, DomainError> {
    const s = raw.trim();
    if (!/^\d+$/.test(s) || ![8, 12, 13, 14].includes(s.length)) {
      return fail("GTIN_INVALID_LENGTH", "GTIN must have 8, 12, 13 or 14 digits");
    }
    if (checkDigit(s.slice(0, -1)) !== Number(s[s.length - 1])) return fail("GTIN_BAD_CHECK_DIGIT", "GTIN check digit is wrong");
    return ok(s.padStart(14, "0") as Gtin);
  },
};
