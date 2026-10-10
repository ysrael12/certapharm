import type { BatchKey } from "../gs1/batch-key.js";
import type { CountryCode } from "../gs1/country-code.js";
import type { ExpiryDate } from "../gs1/expiry-date.js";
import type { Gtin } from "../gs1/gtin.js";
import type { LotNumber } from "../gs1/lot-serial.js";
import { Participant } from "../accreditation/participant.js";
import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export type BatchStatus = "CERTIFIED" | "WITHDRAWN" | "EXPIRED";

export interface Batch {
  readonly key: BatchKey;
  readonly gtin: Gtin;
  readonly lot: LotNumber;
  readonly expiry: ExpiryDate;
  readonly productName: string;
  readonly dosage: string;
  readonly countryOfManufacture: CountryCode;
  readonly issuer: WalletAddress;
  /** SAS attestation address, set once the certificate exists on-chain. */
  readonly certificate?: string;
  /** Stored status; EXPIRED is never stored (B5), use `Batch.statusAt`. */
  readonly status: "CERTIFIED" | "WITHDRAWN";
}

export interface RegisterBatchInput {
  readonly key: BatchKey;
  readonly gtin: Gtin;
  readonly lot: LotNumber;
  readonly expiry: ExpiryDate;
  readonly productName: string;
  readonly dosage: string;
  readonly countryOfManufacture: CountryCode;
  readonly now: Instant;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

export const Batch = {
  /** B1 issuer accreditation, B3 future expiry, field limits. B2 (uniqueness) is checked by the use case against the chain. */
  register(issuer: Participant | undefined, i: RegisterBatchInput): Result<Batch, DomainError> {
    if (!Participant.canIssueCertificates(issuer)) {
      return fail("ISSUER_NOT_ACCREDITED", "Issuer must be an active MANUFACTURER or IMPORTER");
    }
    if (i.expiry <= i.now) return fail("BATCH_EXPIRY_IN_PAST", "Expiry must be in the future");
    const productName = i.productName.trim();
    const dosage = i.dosage.trim();
    if (productName.length === 0 || utf8Len(productName) > 64) return fail("PRODUCT_NAME_INVALID", "Product name must be 1-64 bytes");
    if (dosage.length === 0 || utf8Len(dosage) > 32) return fail("DOSAGE_INVALID", "Dosage must be 1-32 bytes");
    return ok({
      key: i.key, gtin: i.gtin, lot: i.lot, expiry: i.expiry, productName, dosage,
      countryOfManufacture: i.countryOfManufacture, issuer: issuer.wallet, status: "CERTIFIED",
    });
  },
  withCertificate: (b: Batch, attestation: string): Batch => ({ ...b, certificate: attestation }),
  /** B4 */
  withdraw(b: Batch, by: WalletAddress): Result<Batch, DomainError> {
    if (by !== b.issuer) return fail("ONLY_ISSUER_CAN_WITHDRAW", "Only the original issuer can withdraw a batch");
    if (b.status === "WITHDRAWN") return fail("BATCH_ALREADY_WITHDRAWN", "Batch is already withdrawn");
    return ok({ ...b, status: "WITHDRAWN" });
  },
  /** B5 */
  statusAt: (b: Batch, now: Instant): BatchStatus => (b.status === "WITHDRAWN" ? "WITHDRAWN" : now > b.expiry ? "EXPIRED" : "CERTIFIED"),
};
