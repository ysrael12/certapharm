import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "../shared/sha256.js";
import { CountryCode } from "./country-code.js";
import { Gs1DigitalLink } from "./digital-link.js";
import { ExpiryDate } from "./expiry-date.js";
import { Gtin } from "./gtin.js";
import { LegalIdHash } from "./legal-id-hash.js";
import { LotNumber, SerialNumber } from "./lot-serial.js";

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

describe("Gtin", () => {
  it.each([
    ["2001234567893", "02001234567893"],
    ["96385074", "00000096385074"],
    ["036000291452", "00036000291452"],
    ["02001234567893", "02001234567893"],
  ])("normalizes %s", (raw, want) => {
    const r = Gtin.create(raw);
    expect(r.ok && r.value).toBe(want);
  });
  it.each([["123", "GTIN_INVALID_LENGTH"], ["12345678901234567", "GTIN_INVALID_LENGTH"], ["20012345A7893", "GTIN_INVALID_LENGTH"], ["2001234567894", "GTIN_BAD_CHECK_DIGIT"]])(
    "rejects %s", (raw, c) => expect(code(Gtin.create(raw))).toBe(c));
});

describe("LotNumber / SerialNumber", () => {
  it.each(["L2026A", "A-1/2", "x".repeat(20), " L1 "])("accepts lot %j", (v) => expect(LotNumber.create(v).ok).toBe(true));
  it.each(["", "   ", "x".repeat(21), "a b", "é", "a#b"])("rejects lot %j", (v) => expect(code(LotNumber.create(v))).toBe("LOT_INVALID"));
  it("trims", () => { const r = LotNumber.create(" L1 "); expect(r.ok && r.value).toBe("L1"); });
  it("serial", () => {
    expect(SerialNumber.create("0001").ok).toBe(true);
    expect(code(SerialNumber.create(""))).toBe("SERIAL_INVALID");
  });
});

describe("ExpiryDate", () => {
  it("parses YYMMDD and ISO to UTC midnight", () => {
    const a = ExpiryDate.create("271231"), b = ExpiryDate.create("2027-12-31");
    expect(a.ok && b.ok && a.value === b.value && a.value).toBe(Date.UTC(2027, 11, 31) / 1000);
  });
  it("day 00 is the last day of the month", () => {
    const r = ExpiryDate.create("280200");
    expect(r.ok && ExpiryDate.toIso(r.value)).toBe("2028-02-29");
  });
  it.each(["271301", "270230", "2027-02-30", "abc", "27123"])("rejects %s", (v) => expect(code(ExpiryDate.create(v))).toBe("EXPIRY_INVALID"));
});

describe("CountryCode", () => {
  it("uppercases", () => { const r = CountryCode.create("br"); expect(r.ok && r.value).toBe("BR"); });
  it("rejects", () => expect(code(CountryCode.create("BRA"))).toBe("COUNTRY_INVALID"));
});

describe("LegalIdHash / sha256", () => {
  it("matches node crypto", () => {
    for (const s of ["", "abc", "12345678000199", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(200)]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
  it("hashes only the digits of the CNPJ", () => {
    const a = LegalIdHash.fromCnpj("12.345.678/0001-99"), b = LegalIdHash.fromCnpj("12345678000199");
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
    expect(code(LegalIdHash.fromCnpj("123"))).toBe("LEGAL_ID_INVALID");
  });
});

describe("Gs1DigitalLink", () => {
  it("parses a batch link", () => {
    const r = Gs1DigitalLink.parse("https://certapharm.vercel.app/01/02001234567893/10/L2026A");
    expect(r.ok && r.value).toEqual({ gtin: "02001234567893", lot: "L2026A" });
  });
  it("parses unit link with expiry, short gtin, relative path and encoded lot", () => {
    const r = Gs1DigitalLink.parse("/01/2001234567893/10/A%2F1/21/0001?17=271231");
    expect(r.ok && r.value).toEqual({ gtin: "02001234567893", lot: "A/1", serial: "0001", expiry: Date.UTC(2027, 11, 31) / 1000 });
  });
  it("parses element strings", () => {
    const r = Gs1DigitalLink.parse("(01)02001234567893(17)271231(10)L2026A(21)0001");
    expect(r.ok && r.value.serial).toBe("0001");
    expect(r.ok && r.value.lot).toBe("L2026A");
  });
  it.each(["", "hello", "https://x.com/01/2001234567894/10/L1", "https://x.com/02/1/10/L", "(01)02001234567893", "/01/02001234567893/10/%E0%A4%A"])(
    "rejects %j", (v) => expect(code(Gs1DigitalLink.parse(v))).toBe("LINK_UNPARSEABLE"));
  it("round-trips through toPath", () => {
    const r = Gs1DigitalLink.parse("/01/02001234567893/10/A%2F1/21/9");
    expect(r.ok && Gs1DigitalLink.toPath(r.value)).toBe("/01/02001234567893/10/A%2F1/21/9");
  });
});
