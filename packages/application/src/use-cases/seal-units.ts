import {
  Gtin, LotNumber, SerialNumber, UnitSeal, fail, ok,
  type Batch, type Clock, type CountryCode, type Result,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AccreditationRegistry, BatchKeyDeriver, CertificateRegistry, SealMinter, SealReader, SignerRef } from "../ports/index.js";

export const MAX_SERIALS_PER_CALL = 50;

export interface SealUnitsInput {
  readonly issuer: SignerRef;
  readonly gtin: string;
  readonly lot: string;
  readonly serials: readonly string[];
}

export interface SealUnitsOutput {
  readonly tree: string;
  readonly sealed: { readonly serial: string; readonly assetId: string; readonly signature: string; readonly explorerUrl: string }[];
  /** Serials that already had a seal. Re-running sends no transaction for them (U2). */
  readonly skipped: string[];
  readonly failed: { readonly serial: string; readonly code: string; readonly message: string }[];
}

/** UC7: the issuer seals the units of one of its own certified batches. One failure never stops the others. */
export class SealUnits {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly certificates: CertificateRegistry,
    private readonly minter: SealMinter,
    private readonly reader: SealReader,
    private readonly keys: BatchKeyDeriver,
    private readonly clock: Clock,
  ) {}

  async execute(input: SealUnitsInput): Promise<Result<SealUnitsOutput, AppError>> {
    const gtin = Gtin.create(input.gtin);
    if (!gtin.ok) return gtin;
    const lot = LotNumber.create(input.lot);
    if (!lot.ok) return lot;
    if (input.serials.length === 0) return fail("SERIALS_EMPTY", "Give at least one serial number");
    if (input.serials.length > MAX_SERIALS_PER_CALL) return fail("TOO_MANY_SERIALS", `At most ${MAX_SERIALS_PER_CALL} serials per call`);

    const key = await guard(() => this.keys.derive(gtin.value, lot.value));
    if (!key.ok) return key;
    const issuers = await guard(() => this.accreditation.listIssuers());
    if (!issuers.ok) return issuers;
    const cert = await guard(() => this.certificates.findByBatchKey(key.value, issuers.value.map((p) => p.wallet)));
    if (!cert.ok) return cert;
    if (!cert.value) return fail("BATCH_NOT_CERTIFIED", "No active certificate for this batch");
    const batch: Batch = {
      key: key.value, gtin: gtin.value, lot: lot.value, expiry: cert.value.expiry, productName: cert.value.productName,
      dosage: cert.value.dosage, countryOfManufacture: cert.value.country as CountryCode, issuer: cert.value.issuer,
      certificate: cert.value.attestation, status: "CERTIFIED",
    };
    const allowed = UnitSeal.assertCanSeal(batch, input.issuer.address, this.clock.now());
    if (!allowed.ok) return allowed;

    const tree = await guard(() => this.minter.ensureTree(input.issuer));
    if (!tree.ok) return tree;

    const out: { sealed: SealUnitsOutput["sealed"][number][]; skipped: string[]; failed: SealUnitsOutput["failed"][number][] } = { sealed: [], skipped: [], failed: [] };
    for (const raw of new Set(input.serials)) {
      const serial = SerialNumber.create(raw);
      if (!serial.ok) { out.failed.push({ serial: raw, code: serial.error.code, message: serial.error.message }); continue; }
      const unit = { gtin: gtin.value, lot: lot.value, serial: serial.value };
      const existing = await guard(() => this.reader.find(input.issuer.address, unit));
      if (existing.ok && existing.value.status === "SEALED") { out.skipped.push(serial.value); continue; }
      const minted = await guard(() => this.minter.seal(input.issuer, { batchKey: key.value, ...unit }));
      if (minted.ok) out.sealed.push({ serial: serial.value, assetId: minted.value.assetId, signature: minted.value.signature, explorerUrl: minted.value.explorerUrl });
      else out.failed.push({ serial: serial.value, code: minted.error.code, message: minted.error.message });
    }
    return ok({ tree: tree.value.tree, ...out });
  }
}
