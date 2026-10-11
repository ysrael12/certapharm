import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import {
  AccreditParticipant, BootstrapPlatform, InMemoryEventBus, ListDirectory, OnboardIssuer, RaiseAlert, RecordCustodyEvent, RegisterBatch, RevokeParticipant, SealUnits,
  VerifyProduct, type SignerRef,
} from "@certapharm/application";
import type { Clock, WalletAddress } from "@certapharm/domain";
import {
  BubblegumSeals, Keyring, KitBatchKeyDeriver, SealTreeRegistry, MemoCustodyLedger, SasAccreditationRegistry, SasAlertRegistry, SasCertificateRegistry, SasIssuerOnboarding,
  SasPlatformSetup, TxSender, loadKeyFile, loadOrCreateKeyFile, makeConnection,
} from "@certapharm/infra-solana";

/**
 * Walks up from `start` to the folder holding pnpm-workspace.yaml. Outside the repository (a serverless function has no
 * workspace file) it falls back to `start`, so importing this module never throws; configuration then comes from env vars.
 */
function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(start);
    dir = up;
  }
}

export const ROOT = findRoot(process.cwd());
export const KEYS_DIR = resolve(ROOT, ".keys");
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function loadDotenv(): void {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]!] ??= m[2]!;
  }
}

/** A signer that only carries an address. Used by public reads, which never sign. */
const addressOnly = (address: string): KeyPairSigner => ({ address }) as unknown as KeyPairSigner;

/** Secret key bytes of the platform: PLATFORM_SECRET (JSON array) or .keys/platform.json. */
function platformSecret(): Uint8Array {
  const secret = process.env.PLATFORM_SECRET;
  if (secret) return Uint8Array.from(JSON.parse(secret) as number[]);
  const file = resolve(KEYS_DIR, "platform.json");
  if (!existsSync(file)) throw new Error(`Platform key not found at ${file}. Run \`cph keys:new platform\` and fund it, or set PLATFORM_SECRET.`);
  return Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]);
}

async function platformSigner(): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(platformSecret());
}

export interface BuildOptions {
  /** `read` needs no secret key: only PLATFORM_AUTHORITY (or .keys/platform.json) to derive addresses. `write` signs. */
  readonly mode: "read" | "write";
}

export async function buildContainer(options: BuildOptions) {
  loadDotenv();
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set. Copy .env.example to .env and fill it in.");
  const cluster = process.env.CLUSTER ?? "devnet";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "https://certapharm.vercel.app";

  let platform: KeyPairSigner;
  if (options.mode === "write") platform = await platformSigner();
  else {
    const fromEnv = process.env.PLATFORM_AUTHORITY;
    if (fromEnv && ADDRESS.test(fromEnv)) platform = addressOnly(fromEnv);
    else if (existsSync(resolve(KEYS_DIR, "platform.json"))) platform = addressOnly((await loadKeyFile(resolve(KEYS_DIR, "platform.json"))).address);
    else throw new Error("PLATFORM_AUTHORITY is not set (public key of the Platform Authority).");
  }
  const authority = platform.address as string as WalletAddress;

  const conn = makeConnection(rpcUrl, cluster);
  const sender = new TxSender(conn, platform, rpcUrl);
  const keyring = new Keyring().add(platform);
  const clock: Clock = { now: () => Math.floor(Date.now() / 1000) };
  const bus = new InMemoryEventBus();
  const keys = new KitBatchKeyDeriver();

  /** Secret keys of every signer loaded in write mode. Only the seal adapter reads them: Umi needs raw bytes and kit signers do not expose them. */
  const secrets = new Map<string, Uint8Array>();
  if (options.mode === "write") secrets.set(authority, platformSecret());

  const accreditation = new SasAccreditationRegistry(conn.rpc, sender, platform, clock);
  const onboarding = new SasIssuerOnboarding(conn.rpc, sender, keyring);
  const certificates = new SasCertificateRegistry(conn.rpc, sender, keyring, clock);
  const custody = new MemoCustodyLedger(conn.rpc, sender, keyring, clock);
  const alerts = new SasAlertRegistry(conn.rpc, sender, platform, clock);

  /** A key name (`labX`) is loaded or created in `.keys/`; an address is used as is. */
  async function resolveWallet(nameOrAddress: string): Promise<WalletAddress> {
    if (ADDRESS.test(nameOrAddress)) return nameOrAddress as WalletAddress;
    if (options.mode === "read") throw new Error("Key names are not available in read mode");
    const file = resolve(KEYS_DIR, `${nameOrAddress}.json`);
    const signer = await loadOrCreateKeyFile(file);
    secrets.set(signer.address, Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
    keyring.add(signer);
    return signer.address as string as WalletAddress;
  }
  async function signerRef(name: string): Promise<SignerRef> {
    const address = await resolveWallet(name);
    keyring.get(address); // throws a clear error when only an address was given
    return { address };
  }
  /** Loads every `.keys/*.json` into the keyring and returns the names, so a manager can pick an actor. */
  async function knownKeyNames(): Promise<{ name: string; address: WalletAddress }[]> {
    const { readdirSync } = await import("node:fs");
    if (!existsSync(KEYS_DIR)) return [];
    const out: { name: string; address: WalletAddress }[] = [];
    for (const f of readdirSync(KEYS_DIR).filter((n) => n.endsWith(".json") && n !== "platform.json")) {
      const name = f.replace(/\.json$/, "");
      out.push({ name, address: await resolveWallet(name) });
    }
    return out;
  }

  const sealsOn = process.env.SEALS_ENABLED !== "false";
  const trees = new SealTreeRegistry(resolve(ROOT, "config", "seal-trees.json"), process.env.SEAL_TREES);
  const seals = new BubblegumSeals({
    rpcUrl, publicBaseUrl, trees, payer: authority, explorerTx: (sig) => conn.explorerUrl(sig),
    secretOf: (address) => {
      const secret = secrets.get(address);
      if (!secret) throw new Error(`No secret key loaded for ${address}`);
      return secret;
    },
  });

  return {
    mode: options.mode, authority, cluster, publicBaseUrl, bus, keys, resolveWallet, signerRef, knownKeyNames,
    explorerTx: (sig: string) => conn.explorerUrl(sig),
    explorerAddress: (a: string) => `https://explorer.solana.com/address/${a}?cluster=${cluster}`,
    bootstrapPlatform: new BootstrapPlatform(new SasPlatformSetup(conn.rpc, sender, platform)),
    accreditParticipant: new AccreditParticipant(accreditation, authority, clock, bus),
    onboardIssuer: new OnboardIssuer(accreditation, onboarding),
    registerBatch: new RegisterBatch(accreditation, certificates, keys, clock, bus, publicBaseUrl),
    recordCustodyEvent: new RecordCustodyEvent(accreditation, certificates, custody, keys, clock, bus),
    verifyProduct: new VerifyProduct(accreditation, certificates, custody, alerts, keys, clock, sealsOn ? seals : undefined),
    sealUnits: new SealUnits(accreditation, certificates, seals, seals, keys, clock),
    sealsEnabled: sealsOn,
    sealReader: seals,
    sealMinter: seals,
    raiseAlert: new RaiseAlert(alerts, keys, authority, clock),
    revokeParticipant: new RevokeParticipant(accreditation, authority),
    directory: new ListDirectory(accreditation, certificates, alerts, keys),
    adapters: { accreditation, certificates, custody, alerts },
    clock,
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
