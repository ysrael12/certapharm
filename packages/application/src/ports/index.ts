import type {
  Batch, BatchAlert, BatchKey, CustodyEventType, ExpiryDate, Gtin, Instant, LotNumber, Participant, WalletAddress,
} from "@certapharm/domain";

export type { Clock } from "@certapharm/domain";

/** Opaque handle to a signer. Adapters map it to a kit signer held in their keyring. */
export interface SignerRef {
  readonly address: WalletAddress;
}
export interface TxRef {
  readonly signature: string;
  readonly explorerUrl: string;
}

export interface PlatformAddresses {
  readonly platformCredential: string;
  readonly participantSchema: string;
  readonly alertSchema: string;
}

/** Platform credential and its schemas (UC1). `signatures` is empty when everything already existed. */
export interface PlatformSetup {
  ensure(): Promise<PlatformAddresses & { readonly signatures: string[] }>;
}

/** BC1. The Platform Authority signs; adapters know its signer. */
export interface AccreditationRegistry {
  accredit(p: Participant): Promise<TxRef>;
  revoke(wallet: WalletAddress): Promise<TxRef>;
  /** null when missing, expired or not signed by the Platform Authority. */
  find(wallet: WalletAddress): Promise<Participant | null>;
  findMany(wallets: readonly WalletAddress[]): Promise<Map<WalletAddress, Participant>>;
  /** Active MANUFACTURER | IMPORTER participants. */
  listIssuers(): Promise<Participant[]>;
  /** Every active participant, any role. */
  listAll(): Promise<Participant[]>;
}

export interface IssuerCredential {
  readonly credential: string;
  readonly batchSchema: string;
  readonly signatures: string[];
}
export interface IssuerOnboarding {
  ensureIssuerCredential(issuer: SignerRef): Promise<IssuerCredential>;
}

export interface CertificateRecord {
  readonly issuer: WalletAddress;
  readonly attestation: string;
  readonly gtin: Gtin;
  readonly lot: LotNumber;
  readonly expiry: ExpiryDate;
  readonly productName: string;
  readonly dosage: string;
  readonly country: string;
}

/** BC2. */
export interface CertificateRegistry {
  issue(issuer: SignerRef, batch: Batch): Promise<TxRef & { readonly attestation: string }>;
  withdraw(issuer: SignerRef, batchKey: BatchKey): Promise<TxRef>;
  /** Looks only under the given issuers' credentials. A withdrawn certificate is null. */
  findByBatchKey(batchKey: BatchKey, issuers: readonly WalletAddress[]): Promise<CertificateRecord | null>;
  /** Every live certificate under the given issuers' credentials. */
  listByIssuers(issuers: readonly WalletAddress[]): Promise<CertificateRecord[]>;
}

export interface RawCustodyEvent {
  readonly signature: string;
  readonly type: CustodyEventType;
  /** Signer of the memo. */
  readonly actor: WalletAddress;
  readonly occurredAt: Instant;
  readonly temperatureC?: number;
  readonly locationHash?: string;
}

/** BC3. */
export interface CustodyLedger {
  record(
    actor: SignerRef,
    e: { batchKey: BatchKey; gtin: Gtin; lot: LotNumber; type: CustodyEventType; temperatureC?: number; locationHash?: string },
  ): Promise<TxRef>;
  /** Unverified entries for this batch, any signer. */
  readTrail(batchKey: BatchKey): Promise<RawCustodyEvent[]>;
}

/** BC5. */
export interface AlertRegistry {
  raise(a: BatchAlert): Promise<TxRef>;
  clear(batchKey: BatchKey): Promise<TxRef>;
  find(batchKey: BatchKey): Promise<BatchAlert | null>;
  /** Every live alert. */
  list(): Promise<BatchAlert[]>;
}

export interface BatchKeyDeriver {
  derive(gtin: Gtin, lot: LotNumber): Promise<BatchKey>;
}
