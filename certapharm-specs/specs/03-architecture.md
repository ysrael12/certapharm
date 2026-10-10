# 03 — Architecture (Hexagonal / Ports & Adapters)

Diagram: `07-components`.

## 1. Principles

1. **Domain is pure TypeScript.** No I/O, no Solana imports, no `Date.now()` (inject a `Clock`).
2. **Application services** orchestrate one use case each: load → check invariants in aggregates → call ports → publish domain events.
3. **Ports** are TypeScript interfaces owned by the application layer. **Adapters** implement them in `infra-*` packages.
4. **The chain is the source of truth.** The only off-chain state is rebuildable projections (`unit_seals`, optional `custody_index`).
5. **Errors are values.** Use cases return `Result<Ok, DomainError | InfraError>`; only adapters throw, and the application layer converts.

## 2. Monorepo layout (pnpm workspaces)

```
certapharm/
├─ package.json                # pnpm workspaces; "@solana/kit": "5.5.1" in pnpm.overrides
├─ pnpm-workspace.yaml
├─ tsconfig.base.json          # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├─ .env.example
├─ packages/
│  ├─ domain/                  # BC1–BC6 + shared kernel. Zero dependencies.
│  │  └─ src/
│  │     ├─ shared/            # Result, DomainError, Clock, EventBus types
│  │     ├─ gs1/               # Gtin, LotNumber, SerialNumber, ExpiryDate, Gs1DigitalLink
│  │     ├─ accreditation/     # Participant, ParticipantRole, events
│  │     ├─ origin/            # Batch, CertificateOfOrigin, events
│  │     ├─ custody/           # CustodyTrail, CustodyEvent, role→event matrix
│  │     ├─ sealing/           # UnitSeal
│  │     ├─ alerts/            # BatchAlert
│  │     └─ verification/      # VerificationSnapshot, VerdictPolicy, Finding, Verdict
│  ├─ application/             # use cases + ports. Depends on domain only.
│  │  └─ src/
│  │     ├─ ports/             # interfaces below
│  │     └─ use-cases/         # one file per use case (04-use-cases.md)
│  └─ infra-solana/            # adapters. Depends on application + SDKs.
│     └─ src/
│        ├─ rpc.ts             # kit 5.5 rpc + rpcSubscriptions + sendAndConfirm factory
│        ├─ keys.ts            # load keypairs from env (base58 or JSON array)
│        ├─ batch-key.ts       # deriveBatchKey (02 §2)
│        ├─ sas/               # SasAccreditationRegistry, SasCertificateRegistry, SasAlertRegistry
│        ├─ memo/              # MemoCustodyLedger (write + read)
│        ├─ bubblegum/         # BubblegumSealMinter (Umi), DasSealReader
│        └─ projections/       # LibsqlSealIndex, LibsqlCustodyIndex (fallback)
├─ apps/
│  ├─ cli/                     # `cph` CLI (commander). Operator + demo seeding.
│  └─ web/                     # Next.js 15 App Router: public verify page + JSON API
└─ diagrams/                   # PlantUML (this spec pack)
```

## 3. Ports (owned by `application/src/ports`)

```ts
// Identity and time
export interface Clock { now(): Date }
export interface SignerRef { readonly address: string }          // opaque; adapters map to kit/Umi signers

// BC1
export interface AccreditationRegistry {
  accredit(p: { wallet: string; role: ParticipantRole; displayName: string; legalIdHash: string }): Promise<TxRef>;
  revoke(wallet: string): Promise<TxRef>;
  find(wallet: string): Promise<Accreditation | null>;          // null if missing, expired or not signed by platform
  findMany(wallets: string[]): Promise<Map<string, Accreditation>>;
  listIssuers(): Promise<Accreditation[]>;                         // role MANUFACTURER | IMPORTER, cached 60 s
}

// BC2
export interface IssuerOnboarding {
  ensureIssuerCredential(issuer: SignerRef): Promise<{ credential: string; batchSchema: string }>;
}
export interface CertificateRegistry {
  issue(issuer: SignerRef, batch: Batch): Promise<TxRef & { attestation: string }>;
  withdraw(issuer: SignerRef, batchKey: BatchKey): Promise<TxRef>;
  findByBatchKey(batchKey: BatchKey, issuers: Accreditation[]): Promise<CertificateRecord | null>;
}

// BC3
export interface CustodyLedger {
  record(actor: SignerRef, e: { batchKey: BatchKey; gtin: Gtin; lot: LotNumber; type: CustodyEventType;
                                temperatureC?: number; locationHash?: string }): Promise<TxRef>;
  readTrail(batchKey: BatchKey): Promise<RawCustodyEvent[]>;      // unverified, chain order
}

// BC4
export interface SealMinter {
  seal(issuer: SignerRef, unit: UnitId, batchKey: BatchKey): Promise<{ assetId: string; leafIndex: number; tree: string } & TxRef>;
  revoke(issuer: SignerRef, assetId: string): Promise<TxRef>;
}
export interface SealReader { status(unit: UnitId): Promise<"SEALED" | "REVOKED" | "NOT_FOUND"> }
export interface SealIndex {  // projection
  put(row: { unit: UnitId; assetId: string; tree: string; leafIndex: number }): Promise<void>;
  get(unit: UnitId): Promise<{ assetId: string } | null>;
}

// BC5
export interface AlertRegistry {
  raise(a: BatchAlert): Promise<TxRef>;
  clear(batchKey: BatchKey): Promise<TxRef>;
  find(batchKey: BatchKey): Promise<BatchAlert | null>;
}

// Cross-cutting
export interface BatchKeyDeriver { derive(gtin: Gtin, lot: LotNumber): Promise<BatchKey> }
export interface EventBus { publish(e: DomainEvent): void; subscribe<T extends DomainEvent["type"]>(t: T, h: (e: Extract<DomainEvent, { type: T }>) => void): void }
export type TxRef = { signature: string; explorerUrl: string };
```

## 4. Adapters → SDK mapping

| Adapter | Port | SDK calls |
|---|---|---|
| `SasAccreditationRegistry` | AccreditationRegistry | `getCreateAttestationInstruction`, `getCloseAttestationInstruction`, `fetchAllMaybeAttestation`, `getProgramAccounts` (memcmp) |
| `SasIssuerOnboarding` | IssuerOnboarding | `getCreateCredentialInstruction`, `getCreateSchemaInstruction` (idempotent: skip if PDA exists) |
| `SasCertificateRegistry` | CertificateRegistry | `serializeAttestationData`, `getCreateAttestationInstruction`, `getCloseAttestationInstruction`, `getMultipleAccounts` |
| `SasAlertRegistry` | AlertRegistry | same, on platform credential |
| `MemoCustodyLedger` | CustodyLedger | hand-built memo ix + `getTransferSolInstruction` (`@solana-program/system` version compatible with kit 5) with reference account; `getSignaturesForAddress`, `getTransaction` |
| `BubblegumSealMinter` | SealMinter | `createTreeV2`, `mintV2`, `parseLeafFromMintV2Transaction`, `findLeafAssetIdPda`, `getAssetWithProof`, `burnV2` |
| `DasSealReader` | SealReader | DAS `getAsset` |
| `LibsqlSealIndex` | SealIndex | `@libsql/client` (file in dev, Turso in prod) |

> If `@solana-program/system` has no release compatible with kit 5.5, build the 0-lamport transfer
> instruction by hand (System instruction index 2, `u64` lamports LE) — same pattern as the memo ix.

## 5. Composition root

`apps/web/src/server/container.ts` and `apps/cli/src/container.ts` each build the object graph once:

```ts
export function buildContainer(env: Env) {
  const rpc = makeRpc(env.RPC_URL);
  const clock: Clock = { now: () => new Date() };
  const bus = new InMemoryEventBus();
  const keys = new BatchKeyDeriverKit();
  const accreditation = new SasAccreditationRegistry(rpc, env.PLATFORM_AUTHORITY);
  // ...adapters
  return {
    registerBatch: new RegisterBatch(accreditation, certificates, keys, clock, bus),
    recordCustodyEvent: new RecordCustodyEvent(accreditation, certificates, custody, keys, clock, bus),
    verifyProduct: new VerifyProduct(accreditation, certificates, alerts, custody, sealReader, keys, clock),
    // ...
  };
}
```

## 6. Configuration (`.env.example`)

```
CLUSTER=devnet
RPC_URL=https://devnet.helius-rpc.com/?api-key=XXXX      # must support DAS + getProgramAccounts
PUBLIC_BASE_URL=https://certapharm.vercel.app
PLATFORM_AUTHORITY=<base58 pubkey>
PLATFORM_SECRET=<base58 secret or JSON array>            # CLI only, never in web
SEALS_ENABLED=true
CUSTODY_INDEX_FALLBACK=false
LIBSQL_URL=file:./data/projections.db
LIBSQL_AUTH_TOKEN=
```

- The **web app holds no secret keys**. It only reads. All writes happen through the CLI (demo) or a future operator API.
- Demo participants' keys live in `./.keys/*.json` (gitignored), created by `cph keys:new`.

## 7. Tooling

- TypeScript 5.x strict, `tsx` for the CLI, `vitest` for tests, `eslint` with `no-restricted-imports` on `packages/domain/**` and `packages/application/**` blocking `@solana/*`, `sas-lib`, `@metaplex-foundation/*`.
- `zod` for env and API input parsing at the edges only.
- Logging: `pino`, one line per domain event with `signature` and `explorerUrl`.

## 8. Acceptance criteria

- [ ] `pnpm -r build` and `pnpm -r test` pass from a clean clone.
- [ ] Lint fails if any domain/application file imports an SDK.
- [ ] `apps/web` builds without `PLATFORM_SECRET` set.
- [ ] Swapping `MemoCustodyLedger` for an in-memory fake makes every use-case test run offline.
