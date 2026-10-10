import type { BatchKey } from "../gs1/batch-key.js";
import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export const ALERT_LEVELS = ["RECALL", "SUSPECTED_COUNTERFEIT", "COLD_CHAIN_BREACH", "REGULATOR_NOTICE"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export interface BatchAlert {
  readonly batchKey: BatchKey;
  readonly level: AlertLevel;
  readonly reasonCode: string;
  readonly publicNote: string;
  readonly raisedBy: WalletAddress;
  readonly raisedAt: Instant;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

export interface RaiseAlertInput {
  readonly authority: WalletAddress;
  readonly by: WalletAddress;
  readonly batchKey: BatchKey;
  readonly level: AlertLevel;
  readonly reasonCode: string;
  readonly publicNote: string;
  readonly now: Instant;
}

export const BatchAlert = {
  /** A1: only the Platform Authority. A2 (replace) is a close + create done by the adapter. */
  raise(i: RaiseAlertInput): Result<BatchAlert, DomainError> {
    if (i.by !== i.authority) return fail("NOT_PLATFORM_AUTHORITY", "Only the Platform Authority can raise alerts");
    const reasonCode = i.reasonCode.trim();
    const publicNote = i.publicNote.trim();
    if (reasonCode.length === 0 || utf8Len(reasonCode) > 32) return fail("REASON_CODE_INVALID", "Reason code must be 1-32 bytes");
    if (publicNote.length === 0 || utf8Len(publicNote) > 140) return fail("PUBLIC_NOTE_INVALID", "Public note must be 1-140 bytes");
    return ok({ batchKey: i.batchKey, level: i.level, reasonCode, publicNote, raisedBy: i.by, raisedAt: i.now });
  },
  assertCanClear(by: WalletAddress, authority: WalletAddress): Result<true, DomainError> {
    return by === authority ? ok(true) : fail("NOT_PLATFORM_AUTHORITY", "Only the Platform Authority can clear alerts");
  },
};
