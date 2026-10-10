import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AccreditParticipant, BootstrapPlatform, InMemoryEventBus, OnboardIssuer, RaiseAlert, RecordCustodyEvent, RegisterBatch,
  VerifyProduct, type SignerRef,
} from "@certapharm/application";
import type { Clock, WalletAddress } from "@certapharm/domain";
import {
  Keyring, KitBatchKeyDeriver, MemoCustodyLedger, SasAccreditationRegistry, SasAlertRegistry, SasCertificateRegistry, SasIssuerOnboarding,
  SasPlatformSetup, TxSender, loadKeyFile, loadOrCreateKeyFile, makeConnection,
} from "@certapharm/infra-solana";

const ROOT = resolve(import.meta.dirname, "../../..");
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

export async function buildContainer() {
  loadDotenv();
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set. Copy .env.example to .env and fill it in.");
  const cluster = process.env.CLUSTER ?? "devnet";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "https://certapharm.vercel.app";
  const keysDir = KEYS_DIR;

  const platformFile = resolve(keysDir, "platform.json");
  if (!existsSync(platformFile)) throw new Error(`Platform key not found at ${platformFile}. Run \`cph keys:new platform\` and fund it.`);
  const platform = await loadKeyFile(platformFile);
  const authority = platform.address as string as WalletAddress;

  const conn = makeConnection(rpcUrl, cluster);
  const sender = new TxSender(conn, platform, rpcUrl);
  const keyring = new Keyring().add(platform);
  const clock: Clock = { now: () => Math.floor(Date.now() / 1000) };
  const bus = new InMemoryEventBus();
  const keys = new KitBatchKeyDeriver();

  const accreditation = new SasAccreditationRegistry(conn.rpc, sender, platform, clock);
  const onboarding = new SasIssuerOnboarding(conn.rpc, sender, keyring);
  const certificates = new SasCertificateRegistry(conn.rpc, sender, keyring, clock);
  const custody = new MemoCustodyLedger(conn.rpc, sender, keyring, clock);
  const alerts = new SasAlertRegistry(conn.rpc, sender, platform, clock);

  /** A key name (`labX`) is loaded or created in `.keys/`; an address is used as is. */
  async function resolveWallet(nameOrAddress: string): Promise<WalletAddress> {
    if (ADDRESS.test(nameOrAddress)) return nameOrAddress as WalletAddress;
    const signer = await loadOrCreateKeyFile(resolve(keysDir, `${nameOrAddress}.json`));
    keyring.add(signer);
    return signer.address as string as WalletAddress;
  }
  async function signerRef(name: string): Promise<SignerRef> {
    const address = await resolveWallet(name);
    keyring.get(address); // throws a clear error when only an address was given
    return { address };
  }

  return {
    authority, cluster, publicBaseUrl, bus, resolveWallet, signerRef,
    bootstrapPlatform: new BootstrapPlatform(new SasPlatformSetup(conn.rpc, sender, platform)),
    accreditParticipant: new AccreditParticipant(accreditation, authority, clock, bus),
    onboardIssuer: new OnboardIssuer(accreditation, onboarding),
    registerBatch: new RegisterBatch(accreditation, certificates, keys, clock, bus, publicBaseUrl),
    recordCustodyEvent: new RecordCustodyEvent(accreditation, certificates, custody, keys, clock, bus),
    verifyProduct: new VerifyProduct(accreditation, certificates, custody, alerts, keys, clock),
    raiseAlert: new RaiseAlert(alerts, keys, authority, clock),
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
