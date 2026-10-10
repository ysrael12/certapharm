import type { LegalIdHash } from "../gs1/legal-id-hash.js";
import { fail, type DomainError } from "../shared/errors.js";
import { ok, type Result } from "../shared/result.js";
import type { Instant } from "../shared/time.js";
import type { WalletAddress } from "../shared/wallet.js";

export const PARTICIPANT_ROLES = ["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "CARRIER", "PHARMACY"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type ParticipantStatus = "ACTIVE" | "REVOKED";

export interface Participant {
  readonly wallet: WalletAddress;
  readonly role: ParticipantRole;
  readonly displayName: string;
  readonly legalIdHash: LegalIdHash;
  readonly status: ParticipantStatus;
  readonly accreditedAt: Instant;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;
const notAuthority = () => fail("NOT_PLATFORM_AUTHORITY", "Only the Platform Authority can do this");

export interface AccreditInput {
  readonly authority: WalletAddress;
  readonly by: WalletAddress;
  readonly wallet: WalletAddress;
  readonly role: ParticipantRole;
  readonly displayName: string;
  readonly legalIdHash: LegalIdHash;
  readonly at: Instant;
}

export const Participant = {
  /** P1: only the Platform Authority accredits. P2 (one active accreditation per wallet) is checked by the use case. */
  accredit(i: AccreditInput): Result<Participant, DomainError> {
    if (i.by !== i.authority) return notAuthority();
    const name = i.displayName.trim();
    if (name.length === 0 || utf8Len(name) > 48) return fail("DISPLAY_NAME_INVALID", "Display name must be 1-48 bytes");
    return ok({ wallet: i.wallet, role: i.role, displayName: name, legalIdHash: i.legalIdHash, status: "ACTIVE", accreditedAt: i.at });
  },
  revoke(p: Participant, by: WalletAddress, authority: WalletAddress): Result<Participant, DomainError> {
    if (by !== authority) return notAuthority();
    if (p.status === "REVOKED") return fail("PARTICIPANT_ALREADY_REVOKED", "Participant is already revoked");
    return ok({ ...p, status: "REVOKED" });
  },
  isActive: (p: Participant | undefined): p is Participant => p?.status === "ACTIVE",
  /** B1 */
  canIssueCertificates: (p: Participant | undefined): p is Participant =>
    p?.status === "ACTIVE" && (p.role === "MANUFACTURER" || p.role === "IMPORTER"),
};
