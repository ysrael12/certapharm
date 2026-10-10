import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import { ExpiryDate } from "./expiry-date.js";
import { Gtin } from "./gtin.js";
import { LotNumber, SerialNumber } from "./lot-serial.js";

export interface Gs1DigitalLink {
  readonly gtin: Gtin;
  readonly lot: LotNumber;
  readonly serial?: SerialNumber;
  readonly expiry?: ExpiryDate;
}

const bad = () => fail("LINK_UNPARSEABLE", "Not a recognizable GS1 Digital Link or element string");

function build(gtin: string, lot: string, serial?: string, expiry?: string): Result<Gs1DigitalLink, DomainError> {
  const g = Gtin.create(gtin);
  const l = LotNumber.create(lot);
  if (!g.ok || !l.ok) return bad();
  let s: SerialNumber | undefined;
  let e: ExpiryDate | undefined;
  if (serial !== undefined) {
    const r = SerialNumber.create(serial);
    if (!r.ok) return bad();
    s = r.value;
  }
  if (expiry !== undefined) {
    const r = ExpiryDate.create(expiry);
    if (!r.ok) return bad();
    e = r.value;
  }
  return ok({ gtin: g.value, lot: l.value, ...(s ? { serial: s } : {}), ...(e ? { expiry: e } : {}) });
}

function decode(s: string): string | undefined {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}

export const Gs1DigitalLink = {
  /** `https://host/01/{gtin}/10/{lot}[/21/{serial}][?17=YYMMDD]` or `(01)…(10)…[(21)…][(17)…]`. */
  parse(input: string): Result<Gs1DigitalLink, DomainError> {
    const s = input.trim();
    if (s.startsWith("(")) {
      const ai = new Map<string, string>();
      for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) ai.set(m[1]!, m[2]!);
      const g = ai.get("01");
      const l = ai.get("10");
      return g && l ? build(g, l, ai.get("21"), ai.get("17")) : bad();
    }
    const m = /^(?:https?:\/\/[^/?#]+)?(?:\/[^?#]*?)?\/01\/(\d+)\/10\/([^/?#]+)(?:\/21\/([^/?#]+))?\/?(?:\?([^#]*))?(?:#.*)?$/.exec(s);
    if (!m) return bad();
    const lot = decode(m[2]!);
    const serial = m[3] === undefined ? undefined : decode(m[3]);
    if (lot === undefined || (m[3] !== undefined && serial === undefined)) return bad();
    const expiry = (m[4] ?? "").split("&").map((p) => p.split("=")).find(([k]) => k === "17")?.[1];
    return build(m[1]!, lot, serial, expiry);
  },
  toPath(l: Pick<Gs1DigitalLink, "gtin" | "lot" | "serial">): string {
    return `/01/${l.gtin}/10/${encodeURIComponent(l.lot)}${l.serial ? `/21/${encodeURIComponent(l.serial)}` : ""}`;
  },
};
