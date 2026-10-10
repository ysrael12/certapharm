import { fail, type DomainError } from "./errors.js";
import { ok, type Result } from "./result.js";

/** Base58 public key. The Solana adapter owns deeper checks; the domain only needs identity. */
export type WalletAddress = string & { readonly __brand: "WalletAddress" };
export const WalletAddress = {
  create(raw: string): Result<WalletAddress, DomainError> {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? ok(raw as WalletAddress) : fail("WALLET_INVALID", "Invalid wallet address");
  },
};
