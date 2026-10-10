import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";

/** UTC midnight, Unix seconds. */
export type ExpiryDate = Instant & { readonly __brand: "ExpiryDate" };

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const ExpiryDate = {
  /** Accepts `YYMMDD` (GS1 AI 17, day 00 = last day of month, YY = 20YY) or `YYYY-MM-DD`. */
  create(raw: string): Result<ExpiryDate, DomainError> {
    const s = raw.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const gs1 = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
    const parts = iso ?? gs1;
    if (!parts) return fail("EXPIRY_INVALID", "Expiry must be YYMMDD or YYYY-MM-DD");
    const y = iso ? Number(parts[1]) : 2000 + Number(parts[1]);
    const m = Number(parts[2]);
    let d = Number(parts[3]);
    if (m < 1 || m > 12) return fail("EXPIRY_INVALID", "Month out of range");
    if (d === 0 && gs1) d = daysInMonth(y, m);
    if (d < 1 || d > daysInMonth(y, m)) return fail("EXPIRY_INVALID", "Day out of range");
    return ok((Date.UTC(y, m - 1, d) / 1000) as ExpiryDate);
  },
  toIso(e: ExpiryDate): string {
    return new Date(e * 1000).toISOString().slice(0, 10);
  },
};
