import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import type { WalletAddress } from "@certapharm/domain";

/** Reads a Solana CLI style keypair file (JSON array of 64 bytes). */
export async function loadKeyFile(path: string): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

/** Loads the key at `path`, generating and saving a new Ed25519 keypair when the file does not exist. */
export async function loadOrCreateKeyFile(path: string): Promise<KeyPairSigner> {
  if (existsSync(path)) return loadKeyFile(path);
  const pair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const bytes = new Uint8Array(64);
  bytes.set(pkcs8.slice(-32), 0);
  bytes.set(publicKey, 32);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...bytes]));
  return createKeyPairSignerFromBytes(bytes);
}

/** Maps a wallet address to its signer. Adapters resolve a `SignerRef` through it. */
export class Keyring {
  private readonly signers = new Map<string, KeyPairSigner>();

  add(signer: KeyPairSigner): this {
    this.signers.set(signer.address, signer);
    return this;
  }

  get(address: WalletAddress | string): KeyPairSigner {
    const signer = this.signers.get(address);
    if (!signer) throw new Error(`No signer in the keyring for ${address}`);
    return signer;
  }
}
