import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";

export type CountryCode = string & { readonly __brand: "CountryCode" };
export const CountryCode = {
  create(raw: string): Result<CountryCode, DomainError> {
    const s = raw.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(s) ? ok(s as CountryCode) : fail("COUNTRY_INVALID", "Country must be ISO 3166-1 alpha-2");
  },
};
