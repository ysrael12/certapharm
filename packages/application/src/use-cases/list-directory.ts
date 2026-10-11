import {
  ok, type BatchAlert, type BatchKey, type Participant, type Result,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AccreditationRegistry, AlertRegistry, BatchKeyDeriver, CertificateRecord, CertificateRegistry } from "../ports/index.js";

export interface DirectoryBatch extends CertificateRecord {
  readonly batchKey: BatchKey;
}
export interface DirectoryAlert extends BatchAlert {
  readonly gtin?: string;
  readonly lot?: string;
}

/** Read model for the manager screens: what is registered right now. Never writes. */
export class ListDirectory {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly certificates: CertificateRegistry,
    private readonly alerts: AlertRegistry,
    private readonly keys: BatchKeyDeriver,
  ) {}

  participants(): Promise<Result<Participant[], AppError>> {
    return guard(() => this.accreditation.listAll());
  }

  async batches(): Promise<Result<DirectoryBatch[], AppError>> {
    return guard(async () => {
      const issuers = await this.accreditation.listIssuers();
      const records = await this.certificates.listByIssuers(issuers.map((i) => i.wallet));
      return Promise.all(records.map(async (r) => ({ ...r, batchKey: await this.keys.derive(r.gtin, r.lot) })));
    });
  }

  /** Alerts carry the BatchKey only; the lot is filled in when a certificate for it is known. */
  async alertList(): Promise<Result<DirectoryAlert[], AppError>> {
    const [alerts, batches] = await Promise.all([guard(() => this.alerts.list()), this.batches()]);
    if (!alerts.ok) return alerts;
    const byKey = new Map(batches.ok ? batches.value.map((b) => [b.batchKey, b] as const) : []);
    return ok(alerts.value.map((a) => {
      const b = byKey.get(a.batchKey);
      return { ...a, ...(b ? { gtin: b.gtin, lot: b.lot } : {}) };
    }));
  }
}
