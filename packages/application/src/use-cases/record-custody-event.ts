import {
  CUSTODY_EVENT_TYPES, CustodyTrail, Gtin, LotNumber, Participant, fail, ok, sha256Hex,
  type Batch, type Clock, type CountryCode, type CustodyEventType, type Result,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { EventBus } from "../events.js";
import type { AccreditationRegistry, BatchKeyDeriver, CertificateRegistry, CustodyLedger, SignerRef, TxRef } from "../ports/index.js";

export interface RecordCustodyEventInput {
  readonly actor: SignerRef;
  readonly gtin: string;
  readonly lot: string;
  readonly type: string;
  readonly temperatureC?: number;
  /** Free-text site id. Only the first 8 hex chars of its SHA-256 go on-chain. */
  readonly siteId?: string;
}

/** UC5: an accredited participant signs a custody event for a certified batch. */
export class RecordCustodyEvent {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly certificates: CertificateRegistry,
    private readonly custody: CustodyLedger,
    private readonly keys: BatchKeyDeriver,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(input: RecordCustodyEventInput): Promise<Result<{ tx: TxRef }, AppError>> {
    const gtin = Gtin.create(input.gtin);
    if (!gtin.ok) return gtin;
    const lot = LotNumber.create(input.lot);
    if (!lot.ok) return lot;
    if (!(CUSTODY_EVENT_TYPES as readonly string[]).includes(input.type)) return fail("EVENT_TYPE_INVALID", `Unknown event type ${input.type}`);
    const type = input.type as CustodyEventType;

    const key = await guard(() => this.keys.derive(gtin.value, lot.value));
    if (!key.ok) return key;
    const actor = await guard(() => this.accreditation.find(input.actor.address));
    if (!actor.ok) return actor;
    // C1 before touching the certificate, so the error order matches the spec.
    if (!Participant.isActive(actor.value ?? undefined)) return fail("ACTOR_NOT_ACCREDITED", "Actor must hold an active accreditation");

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

    const locationHash = input.siteId ? sha256Hex(input.siteId).slice(0, 8) : undefined;
    const draft = CustodyTrail.validateWrite({
      actor: actor.value ?? undefined, batch, type, now: this.clock.now(),
      ...(input.temperatureC !== undefined ? { temperatureC: input.temperatureC } : {}),
      ...(locationHash ? { locationHash } : {}),
    });
    if (!draft.ok) return draft;

    const tx = await guard(() => this.custody.record(input.actor, {
      batchKey: key.value, gtin: gtin.value, lot: lot.value, type,
      ...(draft.value.temperatureC !== undefined ? { temperatureC: draft.value.temperatureC } : {}),
      ...(draft.value.locationHash ? { locationHash: draft.value.locationHash } : {}),
    }));
    if (!tx.ok) return tx;
    this.bus.publish({ type: "CustodyEventRecorded", batchKey: key.value, eventType: type, actor: input.actor.address, ...tx.value });
    return ok({ tx: tx.value });
  }
}
