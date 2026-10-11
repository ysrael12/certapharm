import type { ParticipantRole } from "../accreditation/participant.js";
import type { AlertLevel } from "../alerts/batch-alert.js";
import { assessTrail, type CustodyEvent } from "../custody/custody.js";
import type { ExpiryDate } from "../gs1/expiry-date.js";
import type { Gtin } from "../gs1/gtin.js";
import type { LotNumber, SerialNumber } from "../gs1/lot-serial.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export type Verdict = "AUTHENTIC" | "AUTHENTIC_WITH_ALERT" | "NOT_RECOGNIZED";
export type Severity = "info" | "warning" | "critical";

export interface Finding {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
}

export type SealLookup = "SEALED" | "REVOKED" | "NOT_FOUND" | "NOT_CHECKED";

export interface VerificationSnapshot {
  readonly query: { readonly gtin: Gtin; readonly lot: LotNumber; readonly serial?: SerialNumber };
  readonly certificate?: {
    readonly issuer: WalletAddress;
    /** Role from a Platform-Authority-signed accreditation; undefined when the issuer is not accredited. */
    readonly issuerRole?: ParticipantRole;
    readonly issuerName?: string;
    readonly attestation?: string;
    readonly expiry: ExpiryDate;
    readonly productName: string;
    readonly dosage: string;
    readonly country: string;
    readonly coldChain?: boolean;
    readonly withdrawn?: boolean;
  };
  readonly alert?: { readonly level: AlertLevel; readonly reasonCode: string; readonly publicNote: string };
  readonly trail: readonly CustodyEvent[];
  /** Seal phase on (UC7 shipped) or off. */
  readonly sealsEnabled: boolean;
  readonly seal: SealLookup;
  /** Asset id of the seal when one was found. */
  readonly sealAssetId?: string;
  readonly now: Instant;
}

export interface VerificationReport {
  readonly verdict: Verdict;
  readonly findings: Finding[];
  readonly batch?: {
    readonly productName: string;
    readonly dosage: string;
    readonly expiry: ExpiryDate;
    readonly country: string;
    readonly issuer: { readonly wallet: WalletAddress; readonly displayName?: string; readonly role?: ParticipantRole };
    readonly certificate?: string;
  };
  readonly alert?: VerificationSnapshot["alert"];
  /** Present when the query named a serial number. */
  readonly unit?: { readonly serial: string; readonly seal: SealLookup; readonly assetId?: string };
  /** Accredited events only. */
  readonly trail: CustodyEvent[];
}

const ALERT_LABEL: Record<AlertLevel, string> = {
  RECALL: "Recall",
  SUSPECTED_COUNTERFEIT: "Suspected counterfeit",
  COLD_CHAIN_BREACH: "Cold chain breach",
  REGULATOR_NOTICE: "Regulator notice",
};

const notRecognized = (code: string, message: string, unit?: VerificationReport["unit"]): VerificationReport => ({
  verdict: "NOT_RECOGNIZED",
  findings: [{ code, severity: "critical", message }],
  ...(unit ? { unit } : {}),
  trail: [],
});

/** Pure. R1..R8 in spec order; the first NOT_RECOGNIZED rule wins. */
export function evaluateVerdict(s: VerificationSnapshot): VerificationReport {
  const c = s.certificate;
  if (!c || c.withdrawn) return notRecognized("NO_CERTIFICATE", "No certificate of origin for this batch"); // R1
  const issuerOk = c.issuerRole === "MANUFACTURER" || c.issuerRole === "IMPORTER";
  if (!issuerOk) return notRecognized("ISSUER_NOT_ACCREDITED", "The issuer is not accredited by the Platform Authority"); // R2
  if (s.query.serial !== undefined && s.sealsEnabled) {
    if (s.seal === "NOT_FOUND") return notRecognized("UNIT_NOT_SEALED", "This unit has no seal", { serial: s.query.serial, seal: "NOT_FOUND" }); // R3
    if (s.seal === "REVOKED") return notRecognized("UNIT_REVOKED", "The seal of this unit was revoked", { serial: s.query.serial, seal: "REVOKED", ...(s.sealAssetId ? { assetId: s.sealAssetId } : {}) }); // R4
  }

  const findings: Finding[] = [];
  if (s.alert) { // R5
    findings.push({ code: `ALERT_${s.alert.level}`, severity: "warning", message: `${ALERT_LABEL[s.alert.level]}: ${s.alert.reasonCode}` });
  }
  if (s.now > c.expiry) findings.push({ code: "BATCH_EXPIRED", severity: "warning", message: "This batch is past its expiry date" }); // R6

  const assessed = assessTrail(s.trail, { coldChain: c.coldChain === true });
  let downgraded = false;
  for (const f of assessed.findings) { // R7 (C4 is reported but never downgrades)
    findings.push({ code: f.code, severity: f.affectsVerdict ? "warning" : "info", message: f.message });
    if (f.affectsVerdict) downgraded = true;
  }

  const verdict: Verdict = s.alert || s.now > c.expiry || downgraded ? "AUTHENTIC_WITH_ALERT" : "AUTHENTIC"; // R8 otherwise
  return {
    verdict,
    findings,
    batch: {
      productName: c.productName, dosage: c.dosage, expiry: c.expiry, country: c.country,
      issuer: { wallet: c.issuer, ...(c.issuerName ? { displayName: c.issuerName } : {}), role: c.issuerRole! },
      ...(c.attestation ? { certificate: c.attestation } : {}),
    },
    ...(s.alert ? { alert: s.alert } : {}),
    ...(s.query.serial !== undefined ? { unit: { serial: s.query.serial, seal: s.sealsEnabled ? s.seal : "NOT_CHECKED", ...(s.sealAssetId ? { assetId: s.sealAssetId } : {}) } } : {}),
    trail: assessed.trail,
  };
}
