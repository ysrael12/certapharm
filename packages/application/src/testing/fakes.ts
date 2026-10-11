import type {
  Batch, BatchAlert, BatchKey, Gtin, Instant, LotNumber, Participant, WalletAddress,
} from "@certapharm/domain";
import { InMemoryEventBus } from "../events.js";
import type {
  AccreditationRegistry, AlertRegistry, BatchKeyDeriver, CertificateRecord, CertificateRegistry, CustodyLedger,
  IssuerCredential, IssuerOnboarding, PlatformAddresses, PlatformSetup, RawCustodyEvent, SignerRef, TxRef,
} from "../ports/index.js";

/** One in-memory "chain" shared by all fakes, so tests run offline. `txCount` counts every write. */
export class FakeChain {
  txCount = 0;
  now: Instant = Date.UTC(2026, 9, 11) / 1000;
  readonly participants = new Map<WalletAddress, Participant>();
  readonly certificates = new Map<BatchKey, CertificateRecord>();
  readonly trails = new Map<BatchKey, RawCustodyEvent[]>();
  readonly alerts = new Map<BatchKey, BatchAlert>();
  readonly issuerCredentials = new Set<WalletAddress>();
  platformCreated = false;

  tx(): TxRef {
    this.txCount += 1;
    const signature = `sig${this.txCount}`;
    return { signature, explorerUrl: `https://explorer.test/tx/${signature}` };
  }
}

export class FakeBatchKeyDeriver implements BatchKeyDeriver {
  async derive(gtin: Gtin, lot: LotNumber): Promise<BatchKey> {
    return `bk:${gtin}:${lot}` as BatchKey;
  }
}

export class FakePlatformSetup implements PlatformSetup {
  constructor(private readonly chain: FakeChain) {}
  async ensure(): Promise<PlatformAddresses & { signatures: string[] }> {
    const addresses = { platformCredential: "cred", participantSchema: "pschema", alertSchema: "aschema" };
    if (this.chain.platformCreated) return { ...addresses, signatures: [] };
    this.chain.platformCreated = true;
    return { ...addresses, signatures: [this.chain.tx().signature, this.chain.tx().signature, this.chain.tx().signature] };
  }
}

export class FakeAccreditationRegistry implements AccreditationRegistry {
  constructor(private readonly chain: FakeChain) {}
  async accredit(p: Participant): Promise<TxRef> {
    this.chain.participants.set(p.wallet, p);
    return this.chain.tx();
  }
  async revoke(wallet: WalletAddress): Promise<TxRef> {
    this.chain.participants.delete(wallet);
    return this.chain.tx();
  }
  async find(wallet: WalletAddress): Promise<Participant | null> {
    return this.chain.participants.get(wallet) ?? null;
  }
  async findMany(wallets: readonly WalletAddress[]): Promise<Map<WalletAddress, Participant>> {
    return new Map(wallets.flatMap((w) => { const p = this.chain.participants.get(w); return p ? [[w, p] as const] : []; }));
  }
  async listAll(): Promise<Participant[]> {
    return [...this.chain.participants.values()];
  }
  async listIssuers(): Promise<Participant[]> {
    return [...this.chain.participants.values()].filter((p) => p.role === "MANUFACTURER" || p.role === "IMPORTER");
  }
}

export class FakeIssuerOnboarding implements IssuerOnboarding {
  constructor(private readonly chain: FakeChain) {}
  async ensureIssuerCredential(issuer: SignerRef): Promise<IssuerCredential> {
    const base = { credential: `cred:${issuer.address}`, batchSchema: `batch:${issuer.address}` };
    if (this.chain.issuerCredentials.has(issuer.address)) return { ...base, signatures: [] };
    this.chain.issuerCredentials.add(issuer.address);
    return { ...base, signatures: [this.chain.tx().signature, this.chain.tx().signature] };
  }
}

export class FakeCertificateRegistry implements CertificateRegistry {
  constructor(private readonly chain: FakeChain) {}
  async issue(issuer: SignerRef, b: Batch): Promise<TxRef & { attestation: string }> {
    const attestation = `att:${b.key}`;
    this.chain.certificates.set(b.key, {
      issuer: issuer.address, attestation, gtin: b.gtin, lot: b.lot, expiry: b.expiry,
      productName: b.productName, dosage: b.dosage, country: b.countryOfManufacture,
    });
    return { ...this.chain.tx(), attestation };
  }
  async withdraw(_issuer: SignerRef, key: BatchKey): Promise<TxRef> {
    this.chain.certificates.delete(key);
    return this.chain.tx();
  }
  async listByIssuers(issuers: readonly WalletAddress[]): Promise<CertificateRecord[]> {
    return [...this.chain.certificates.values()].filter((c) => issuers.includes(c.issuer));
  }
  async findByBatchKey(key: BatchKey, issuers: readonly WalletAddress[]): Promise<CertificateRecord | null> {
    const c = this.chain.certificates.get(key);
    return c && issuers.includes(c.issuer) ? c : null;
  }
}

export class FakeCustodyLedger implements CustodyLedger {
  constructor(private readonly chain: FakeChain) {}
  async record(actor: SignerRef, e: Parameters<CustodyLedger["record"]>[1]): Promise<TxRef> {
    const tx = this.chain.tx();
    const list = this.chain.trails.get(e.batchKey) ?? [];
    list.push({
      signature: tx.signature, type: e.type, actor: actor.address, occurredAt: this.chain.now,
      ...(e.temperatureC !== undefined ? { temperatureC: e.temperatureC } : {}),
      ...(e.locationHash ? { locationHash: e.locationHash } : {}),
    });
    this.chain.trails.set(e.batchKey, list);
    return tx;
  }
  async readTrail(key: BatchKey): Promise<RawCustodyEvent[]> {
    return [...(this.chain.trails.get(key) ?? [])];
  }
}

export class FakeAlertRegistry implements AlertRegistry {
  constructor(private readonly chain: FakeChain) {}
  async raise(a: BatchAlert): Promise<TxRef> {
    this.chain.alerts.set(a.batchKey, a);
    return this.chain.tx();
  }
  async clear(key: BatchKey): Promise<TxRef> {
    this.chain.alerts.delete(key);
    return this.chain.tx();
  }
  async find(key: BatchKey): Promise<BatchAlert | null> {
    return this.chain.alerts.get(key) ?? null;
  }
  async list(): Promise<BatchAlert[]> {
    return [...this.chain.alerts.values()];
  }
}

export function makeWorld() {
  const chain = new FakeChain();
  return {
    chain,
    clock: { now: () => chain.now },
    bus: new InMemoryEventBus(),
    keys: new FakeBatchKeyDeriver(),
    platform: new FakePlatformSetup(chain),
    accreditation: new FakeAccreditationRegistry(chain),
    onboarding: new FakeIssuerOnboarding(chain),
    certificates: new FakeCertificateRegistry(chain),
    custody: new FakeCustodyLedger(chain),
    alerts: new FakeAlertRegistry(chain),
  };
}
