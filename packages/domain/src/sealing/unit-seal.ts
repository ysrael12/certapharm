import type { BatchKey } from "../gs1/batch-key.js";
import type { Gtin } from "../gs1/gtin.js";
import type { LotNumber, SerialNumber } from "../gs1/lot-serial.js";
import { Batch } from "../origin/batch.js";
import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export interface Unit {
  readonly gtin: Gtin;
  readonly lot: LotNumber;
  readonly serial: SerialNumber;
}
export type SealStatus = "SEALED" | "REVOKED";

export interface UnitSeal {
  readonly unit: Unit;
  readonly batchKey: BatchKey;
  readonly assetId: string;
  readonly tree: string;
  readonly leafIndex: number;
  readonly status: SealStatus;
}

export const UnitSeal = {
  /** U1 batch certified, U3 only the issuer. U2 (one seal per unit) is checked against the projection by the use case. */
  assertCanSeal(batch: Batch, by: WalletAddress, now: Instant): Result<true, DomainError> {
    if (Batch.statusAt(batch, now) !== "CERTIFIED") return fail("BATCH_NOT_CERTIFIED", "Batch is withdrawn or expired");
    if (by !== batch.issuer) return fail("ONLY_ISSUER_CAN_SEAL", "Only the batch issuer can seal units");
    return ok(true);
  },
  revoke(seal: UnitSeal, batch: Batch, by: WalletAddress): Result<UnitSeal, DomainError> {
    if (by !== batch.issuer) return fail("ONLY_ISSUER_CAN_SEAL", "Only the batch issuer can revoke seals");
    if (seal.status === "REVOKED") return fail("UNIT_ALREADY_REVOKED", "Seal is already revoked");
    return ok({ ...seal, status: "REVOKED" });
  },
};
