import { Participant, type ParticipantRole } from "../accreditation/participant.js";
import { Batch } from "../origin/batch.js";
import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export const CUSTODY_EVENT_TYPES = ["SHIPPED", "RECEIVED", "STORED", "DISPENSED"] as const;
export type CustodyEventType = (typeof CUSTODY_EVENT_TYPES)[number];

/** Role x event matrix (spec 01 §4.3 C3). */
const ALLOWED: Readonly<Record<ParticipantRole, readonly CustodyEventType[]>> = {
  MANUFACTURER: ["SHIPPED", "STORED"],
  IMPORTER: ["SHIPPED", "STORED"],
  DISTRIBUTOR: ["SHIPPED", "RECEIVED", "STORED"],
  CARRIER: ["SHIPPED", "RECEIVED"],
  PHARMACY: ["RECEIVED", "STORED", "DISPENSED"],
};
export const isEventAllowed = (role: ParticipantRole, type: CustodyEventType): boolean => ALLOWED[role].includes(type);

export const TEMPERATURE_RANGE_C = { min: -40, max: 60 } as const;
export const COLD_CHAIN_RANGE_C = { min: 2, max: 8 } as const;

export interface CustodyEvent {
  readonly signature: string;
  readonly type: CustodyEventType;
  readonly actor: WalletAddress;
  /** Resolved at read time; undefined when the actor is not accredited. */
  readonly actorRole?: ParticipantRole;
  readonly actorName?: string;
  readonly occurredAt: Instant;
  readonly temperatureC?: number;
  readonly locationHash?: string;
}

export interface CustodyDraft {
  readonly type: CustodyEventType;
  readonly actor: WalletAddress;
  readonly temperatureC?: number;
  readonly locationHash?: string;
}

export interface CustodyWriteInput {
  readonly actor: Participant | undefined;
  readonly batch: Batch;
  readonly type: CustodyEventType;
  readonly temperatureC?: number;
  readonly locationHash?: string;
  readonly now: Instant;
}

export const CustodyTrail = {
  /** Write-side invariants C1, C2, C3 plus the temperature bounds. */
  validateWrite(i: CustodyWriteInput): Result<CustodyDraft, DomainError> {
    if (!Participant.isActive(i.actor)) return fail("ACTOR_NOT_ACCREDITED", "Actor must hold an active accreditation");
    if (Batch.statusAt(i.batch, i.now) !== "CERTIFIED") return fail("BATCH_NOT_CERTIFIED", "Batch is withdrawn or expired");
    if (!isEventAllowed(i.actor.role, i.type)) {
      return fail("EVENT_NOT_ALLOWED_FOR_ROLE", `${i.actor.role} cannot record ${i.type}`);
    }
    if (i.temperatureC !== undefined && !(i.temperatureC >= TEMPERATURE_RANGE_C.min && i.temperatureC <= TEMPERATURE_RANGE_C.max)) {
      return fail("TEMPERATURE_OUT_OF_RANGE", "Temperature must be between -40 and 60 °C");
    }
    return ok({
      type: i.type, actor: i.actor.wallet,
      ...(i.temperatureC !== undefined ? { temperatureC: i.temperatureC } : {}),
      ...(i.locationHash !== undefined ? { locationHash: i.locationHash } : {}),
    });
  },

  /** Order by time, then signature for stability. */
  order: (events: readonly CustodyEvent[]): CustodyEvent[] =>
    [...events].sort((a, b) => a.occurredAt - b.occurredAt || a.signature.localeCompare(b.signature)),
};

export type TrailFindingCode =
  | "CUSTODY_SIGNER_NOT_ACCREDITED"
  | "CUSTODY_GAP"
  | "CUSTODY_ROLE_NOT_ALLOWED"
  | "COLD_CHAIN_BREACH_REPORTED";

export interface TrailFinding {
  readonly code: TrailFindingCode;
  readonly message: string;
  /** True when the finding downgrades the verdict (R7). C4 only informs. */
  readonly affectsVerdict: boolean;
}

export interface TrailAssessment {
  /** Accredited events only, ordered. */
  readonly trail: CustodyEvent[];
  readonly findings: TrailFinding[];
}

/** Read-side checks C4, C5, C7 (+ role matrix). Violations are findings, never exceptions. */
export function assessTrail(events: readonly CustodyEvent[], opts: { coldChain: boolean }): TrailAssessment {
  const findings: TrailFinding[] = [];
  const ordered = CustodyTrail.order(events);
  const trail = ordered.filter((e) => e.actorRole !== undefined);
  const dropped = ordered.length - trail.length;
  if (dropped > 0) {
    findings.push({ code: "CUSTODY_SIGNER_NOT_ACCREDITED", affectsVerdict: false, message: `${dropped} custody entr${dropped === 1 ? "y" : "ies"} from non-accredited signers ignored` });
  }
  let shipped = false;
  let gap = false;
  let mismatch = false;
  let breach = false;
  for (const e of trail) {
    if (e.type === "SHIPPED") shipped = true;
    if (e.type === "RECEIVED" && !shipped) gap = true;
    if (e.actorRole && !isEventAllowed(e.actorRole, e.type)) mismatch = true;
    if (opts.coldChain && e.temperatureC !== undefined && (e.temperatureC < COLD_CHAIN_RANGE_C.min || e.temperatureC > COLD_CHAIN_RANGE_C.max)) breach = true;
  }
  if (gap) findings.push({ code: "CUSTODY_GAP", affectsVerdict: true, message: "A RECEIVED event has no earlier SHIPPED event" });
  if (mismatch) findings.push({ code: "CUSTODY_ROLE_NOT_ALLOWED", affectsVerdict: true, message: "An event was recorded by a role not allowed to record it" });
  if (breach) findings.push({ code: "COLD_CHAIN_BREACH_REPORTED", affectsVerdict: true, message: "A temperature outside 2-8 °C was reported" });
  return { trail, findings };
}
