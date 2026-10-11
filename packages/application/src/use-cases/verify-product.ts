import {
  Gs1DigitalLink, evaluateVerdict, ok,
  type Clock, type CustodyEvent, type Participant, type Result, type VerificationReport, type VerificationSnapshot, type WalletAddress,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AccreditationRegistry, AlertRegistry, BatchKeyDeriver, CertificateRegistry, CustodyLedger, SealFound, SealReader } from "../ports/index.js";

const REPORT_TTL_MS = 15_000;

/** UC6: public, read-only. Link in, `VerificationReport` out. Never writes. */
export class VerifyProduct {
  private readonly cache = new Map<string, { at: number; report: VerificationReport }>();

  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly certificates: CertificateRegistry,
    private readonly custody: CustodyLedger,
    private readonly alerts: AlertRegistry,
    private readonly keys: BatchKeyDeriver,
    private readonly clock: Clock,
    /** When given, a query with a serial number is checked against the unit seals (UC7). */
    private readonly seals?: SealReader,
  ) {}

  async execute(input: { link: string }): Promise<Result<VerificationReport, AppError>> {
    const link = Gs1DigitalLink.parse(input.link);
    if (!link.ok) return link;
    const { gtin, lot, serial } = link.value;

    const cacheKey = `${gtin}|${lot}|${serial ?? ""}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < REPORT_TTL_MS) return ok(hit.report);

    const read = await guard(async () => {
      const batchKey = await this.keys.derive(gtin, lot);
      const [certificate, alert, raw] = await Promise.all([
        this.accreditation.listIssuers().then((issuers) => this.certificates.findByBatchKey(batchKey, issuers.map((i) => i.wallet))),
        this.alerts.find(batchKey),
        this.custody.readTrail(batchKey),
      ]);
      const seal: SealFound | undefined = serial && certificate && this.seals
        ? await this.seals.find(certificate.issuer, { gtin, lot, serial })
        : undefined;
      const wallets = [...new Set<WalletAddress>([...raw.map((e) => e.actor), ...(certificate ? [certificate.issuer] : [])])];
      const people = await this.accreditation.findMany(wallets);
      return { certificate, alert, raw, people, seal };
    });
    if (!read.ok) return read;
    const { certificate, alert, raw, people, seal } = read.value;

    const trail: CustodyEvent[] = raw.map((e) => {
      const who: Participant | undefined = people.get(e.actor);
      return {
        signature: e.signature, type: e.type, actor: e.actor, occurredAt: e.occurredAt,
        ...(who ? { actorRole: who.role, actorName: who.displayName } : {}),
        ...(e.temperatureC !== undefined ? { temperatureC: e.temperatureC } : {}),
        ...(e.locationHash ? { locationHash: e.locationHash } : {}),
      };
    });
    const issuer = certificate ? people.get(certificate.issuer) : undefined;
    const snapshot: VerificationSnapshot = {
      query: { gtin, lot, ...(serial ? { serial } : {}) },
      ...(certificate ? {
        certificate: {
          issuer: certificate.issuer, attestation: certificate.attestation, expiry: certificate.expiry,
          productName: certificate.productName, dosage: certificate.dosage, country: certificate.country,
          ...(issuer ? { issuerRole: issuer.role, issuerName: issuer.displayName } : {}),
        },
      } : {}),
      ...(alert ? { alert: { level: alert.level, reasonCode: alert.reasonCode, publicNote: alert.publicNote } } : {}),
      trail,
      sealsEnabled: this.seals !== undefined,
      seal: seal ? seal.status : "NOT_CHECKED",
      ...(seal?.assetId ? { sealAssetId: seal.assetId } : {}),
      now: this.clock.now(),
    };
    const report = evaluateVerdict(snapshot);
    this.cache.set(cacheKey, { at: Date.now(), report });
    return ok(report);
  }
}
