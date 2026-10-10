import {
  LegalIdHash, PARTICIPANT_ROLES, Participant, WalletAddress, fail, ok,
  type Clock, type ParticipantRole, type Result,
} from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { EventBus } from "../events.js";
import type { AccreditationRegistry, TxRef } from "../ports/index.js";

export interface AccreditParticipantInput {
  /** Wallet that signs; must be the Platform Authority (P1). */
  readonly by: string;
  readonly wallet: string;
  readonly role: string;
  readonly displayName: string;
  /** Raw CNPJ. Only its SHA-256 leaves this use case. */
  readonly cnpj: string;
}

/** UC2: the Platform Authority accredits one wallet with one role. */
export class AccreditParticipant {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly authority: WalletAddress,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(input: AccreditParticipantInput): Promise<Result<{ participant: Participant; tx: TxRef }, AppError>> {
    const by = WalletAddress.create(input.by);
    if (!by.ok) return by;
    const wallet = WalletAddress.create(input.wallet);
    if (!wallet.ok) return wallet;
    if (!(PARTICIPANT_ROLES as readonly string[]).includes(input.role)) return fail("ROLE_INVALID", `Unknown role ${input.role}`);
    const legalIdHash = LegalIdHash.fromCnpj(input.cnpj);
    if (!legalIdHash.ok) return fail("CNPJ_INVALID", legalIdHash.error.message);

    const participant = Participant.accredit({
      authority: this.authority, by: by.value, wallet: wallet.value, role: input.role as ParticipantRole,
      displayName: input.displayName, legalIdHash: legalIdHash.value, at: this.clock.now(),
    });
    if (!participant.ok) return participant;

    const existing = await guard(() => this.accreditation.find(wallet.value));
    if (!existing.ok) return existing;
    if (Participant.isActive(existing.value ?? undefined)) return fail("ALREADY_ACCREDITED", "Wallet already holds an active accreditation");

    const tx = await guard(() => this.accreditation.accredit(participant.value));
    if (!tx.ok) return tx;
    this.bus.publish({ type: "ParticipantAccredited", wallet: wallet.value, role: participant.value.role, ...tx.value });
    return ok({ participant: participant.value, tx: tx.value });
  }
}
