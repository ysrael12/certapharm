import type { Address } from "@solana/kit";
import type { ParticipantRole, WalletAddress } from "@certapharm/domain";
import type { SolanaRpc } from "../rpc.js";

export const asAddress = (a: string): Address => a as Address;
export const asWallet = (a: string): WalletAddress => a as WalletAddress;

export const PLATFORM_CREDENTIAL_NAME = "certapharm";
export const ISSUER_CREDENTIAL_NAME = "certapharm-issuer";
export const SCHEMA_VERSION = 1;

/** Spec 02 §3.1. */
export const ROLE_CODE: Readonly<Record<ParticipantRole, number>> = {
  MANUFACTURER: 1, IMPORTER: 2, DISTRIBUTOR: 3, CARRIER: 4, PHARMACY: 5,
};
export const ROLE_BY_CODE: Readonly<Record<number, ParticipantRole>> = Object.fromEntries(
  Object.entries(ROLE_CODE).map(([role, code]) => [code, role as ParticipantRole]),
);

/** SAS layout bytes (spec 02 §3). */
export const LAYOUT = { U8: 0, I64: 8, STRING: 12 } as const;

export async function accountExists(rpc: SolanaRpc, address: Address): Promise<boolean> {
  return (await rpc.getAccountInfo(address, { encoding: "base64" }).send()).value !== null;
}

/** SAS uses expiry 0 for "never expires". */
export const isLive = (expiry: bigint | number, now: number): boolean => Number(expiry) === 0 || Number(expiry) > now;
