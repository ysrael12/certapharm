import {
  Batch, CountryCode, ExpiryDate, Gtin, LotNumber, fail, ok,
  type Clock, type Result,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { EventBus } from "../events.js";
import type { AccreditationRegistry, BatchKeyDeriver, CertificateRegistry, SignerRef, TxRef } from "../ports/index.js";

export interface RegisterBatchInput {
  readonly issuer: SignerRef;
  readonly gtin: string;
  readonly lot: string;
  /** YYMMDD or ISO date. */
  readonly expiry: string;
  readonly productName: string;
  readonly dosage: string;
  readonly country: string;
}

export interface RegisterBatchOutput {
  readonly batch: Batch;
  readonly tx: TxRef;
  readonly verifyUrl: string;
}

/** UC4: an accredited issuer certifies a batch of medicine boxes. */
export class RegisterBatch {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly certificates: CertificateRegistry,
    private readonly keys: BatchKeyDeriver,
    private readonly clock: Clock,
    private readonly bus: EventBus,
    private readonly publicBaseUrl: string,
  ) {}

  async execute(input: RegisterBatchInput): Promise<Result<RegisterBatchOutput, AppError>> {
    const gtin = Gtin.create(input.gtin);
    if (!gtin.ok) return gtin;
    const lot = LotNumber.create(input.lot);
    if (!lot.ok) return lot;
    const expiry = ExpiryDate.create(input.expiry);
    if (!expiry.ok) return expiry;
    const country = CountryCode.create(input.country);
    if (!country.ok) return country;

    const issuer = await guard(() => this.accreditation.find(input.issuer.address));
    if (!issuer.ok) return issuer;
    const key = await guard(() => this.keys.derive(gtin.value, lot.value));
    if (!key.ok) return key;

    // B1 and B3 first, so a non-accredited issuer never reaches the chain.
    const batch = Batch.register(issuer.value ?? undefined, {
      key: key.value, gtin: gtin.value, lot: lot.value, expiry: expiry.value, productName: input.productName,
      dosage: input.dosage, countryOfManufacture: country.value, now: this.clock.now(),
    });
    if (!batch.ok) return batch;

    // B2: one certificate per (gtin, lot), whichever accredited issuer holds it.
    const issuers = await guard(() => this.accreditation.listIssuers());
    if (!issuers.ok) return issuers;
    const wallets = [...new Set([input.issuer.address, ...issuers.value.map((p) => p.wallet)])];
    const existing = await guard(() => this.certificates.findByBatchKey(key.value, wallets));
    if (!existing.ok) return existing;
    if (existing.value) return fail("BATCH_ALREADY_CERTIFIED", `Batch ${gtin.value}/${lot.value} already has a certificate`);

    const issued = await guard(() => this.certificates.issue(input.issuer, batch.value));
    if (!issued.ok) return issued;
    const { attestation, ...tx } = issued.value;
    this.bus.publish({
      type: "BatchCertified", batchKey: key.value, gtin: gtin.value, lot: lot.value, issuer: batch.value.issuer, ...tx,
    });
    return ok({
      batch: Batch.withCertificate(batch.value, attestation),
      tx,
      verifyUrl: `${this.publicBaseUrl}/01/${gtin.value}/10/${encodeURIComponent(lot.value)}`,
    });
  }
}
