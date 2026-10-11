import { Gs1DigitalLink, ok, type Result, type VerificationReport } from "@certapharm/domain";
import { guard, type AppError } from "@certapharm/application";
import type { VerifyResponse } from "./contract";
import { readContainer } from "./container";

export interface LoadedReport {
  readonly report: VerificationReport;
  readonly batchKey: string;
  readonly query: { gtin: string; lot: string; serial?: string };
  readonly checkedAt: number;
  readonly cluster: string;
  readonly explorerTx: (signature: string) => string;
  readonly explorerAddress: (address: string) => string;
}

/** Link in (GS1 Digital Link or element string), report out. An unknown batch is a valid NOT_RECOGNIZED answer, not an error. */
export async function loadReport(link: string): Promise<Result<LoadedReport, AppError>> {
  const parsed = Gs1DigitalLink.parse(link);
  if (!parsed.ok) return parsed;
  const booted = await guard(readContainer);
  if (!booted.ok) return booted;
  const c = booted.value;
  const result = await c.verifyProduct.execute({ link });
  if (!result.ok) return result;
  const key = await guard(() => c.keys.derive(parsed.value.gtin, parsed.value.lot));
  if (!key.ok) return key;
  return ok({
    report: result.value,
    batchKey: key.value as string,
    query: { gtin: parsed.value.gtin, lot: parsed.value.lot, ...(parsed.value.serial ? { serial: parsed.value.serial } : {}) },
    checkedAt: c.clock.now(),
    cluster: c.cluster,
    explorerTx: c.explorerTx,
    explorerAddress: c.explorerAddress,
  });
}

const isoDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

export function toApiResponse(l: LoadedReport): VerifyResponse {
  const { report: r } = l;
  return {
    verdict: r.verdict,
    findings: r.findings.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
    query: l.query,
    ...(r.batch ? {
      batch: {
        batchKey: l.batchKey,
        productName: r.batch.productName,
        dosage: r.batch.dosage,
        expiry: isoDate(r.batch.expiry),
        country: r.batch.country,
        issuer: {
          wallet: r.batch.issuer.wallet,
          ...(r.batch.issuer.displayName ? { displayName: r.batch.issuer.displayName } : {}),
          ...(r.batch.issuer.role ? { role: r.batch.issuer.role } : {}),
        },
        ...(r.batch.certificate ? { certificate: { attestation: r.batch.certificate, explorerUrl: l.explorerAddress(r.batch.certificate) } } : {}),
      },
    } : {}),
    ...(r.alert ? { alert: { level: r.alert.level, reasonCode: r.alert.reasonCode, publicNote: r.alert.publicNote } } : {}),
    trail: r.trail.map((e) => ({
      type: e.type,
      actor: { ...(e.actorName ? { displayName: e.actorName } : {}), ...(e.actorRole ? { role: e.actorRole } : {}) },
      at: new Date(e.occurredAt * 1000).toISOString(),
      temperatureC: e.temperatureC ?? null,
      signature: e.signature,
      explorerUrl: l.explorerTx(e.signature),
    })),
    ...(r.unit ? { unit: { serial: r.unit.serial, seal: r.unit.seal, ...(r.unit.assetId ? { assetId: r.unit.assetId } : {}) } } : {}),
    checkedAt: new Date(l.checkedAt * 1000).toISOString(),
    cluster: l.cluster,
  };
}
