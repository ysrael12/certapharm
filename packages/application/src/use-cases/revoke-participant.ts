import { WalletAddress, fail, ok, type Result } from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AccreditationRegistry, TxRef } from "../ports/index.js";

/** UC2b: the Platform Authority revokes one accreditation. Closes the participant attestation. */
export class RevokeParticipant {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly authority: WalletAddress,
  ) {}

  async execute(input: { by: string; wallet: string }): Promise<Result<{ tx: TxRef }, AppError>> {
    const by = WalletAddress.create(input.by);
    if (!by.ok) return by;
    if (by.value !== this.authority) return fail("NOT_PLATFORM_AUTHORITY", "Only the Platform Authority can revoke an accreditation");
    const wallet = WalletAddress.create(input.wallet);
    if (!wallet.ok) return wallet;
    const existing = await guard(() => this.accreditation.find(wallet.value));
    if (!existing.ok) return existing;
    if (!existing.value) return fail("NOT_ACCREDITED", "This wallet holds no active accreditation");
    const tx = await guard(() => this.accreditation.revoke(wallet.value));
    return tx.ok ? ok({ tx: tx.value }) : tx;
  }
}
