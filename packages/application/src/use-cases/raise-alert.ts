import {
  ALERT_LEVELS, BatchAlert, Gtin, LotNumber, fail, ok,
  type AlertLevel, type Clock, type Result, type WalletAddress,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AlertRegistry, BatchKeyDeriver, TxRef } from "../ports/index.js";

export interface RaiseAlertInput {
  readonly by: WalletAddress;
  readonly gtin: string;
  readonly lot: string;
  readonly level: string;
  readonly reasonCode: string;
  readonly publicNote: string;
}

/** UC8: the Platform Authority raises (replaces) or clears the alert of a batch. */
export class RaiseAlert {
  constructor(
    private readonly alerts: AlertRegistry,
    private readonly keys: BatchKeyDeriver,
    private readonly authority: WalletAddress,
    private readonly clock: Clock,
  ) {}

  async raise(input: RaiseAlertInput): Promise<Result<{ tx: TxRef }, AppError>> {
    const gtin = Gtin.create(input.gtin);
    if (!gtin.ok) return gtin;
    const lot = LotNumber.create(input.lot);
    if (!lot.ok) return lot;
    if (!(ALERT_LEVELS as readonly string[]).includes(input.level)) return fail("ALERT_LEVEL_INVALID", `Unknown alert level ${input.level}`);
    const key = await guard(() => this.keys.derive(gtin.value, lot.value));
    if (!key.ok) return key;
    const alert = BatchAlert.raise({
      authority: this.authority, by: input.by, batchKey: key.value, level: input.level as AlertLevel,
      reasonCode: input.reasonCode, publicNote: input.publicNote, now: this.clock.now(),
    });
    if (!alert.ok) return alert;
    const tx = await guard(() => this.alerts.raise(alert.value));
    return tx.ok ? ok({ tx: tx.value }) : tx;
  }

  async clear(input: { by: WalletAddress; gtin: string; lot: string }): Promise<Result<{ tx: TxRef }, AppError>> {
    const gtin = Gtin.create(input.gtin);
    if (!gtin.ok) return gtin;
    const lot = LotNumber.create(input.lot);
    if (!lot.ok) return lot;
    const allowed = BatchAlert.assertCanClear(input.by, this.authority);
    if (!allowed.ok) return allowed;
    const key = await guard(() => this.keys.derive(gtin.value, lot.value));
    if (!key.ok) return key;
    const tx = await guard(() => this.alerts.clear(key.value));
    return tx.ok ? ok({ tx: tx.value }) : tx;
  }
}
