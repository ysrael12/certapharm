# 01 — Domain Model (DDD)

Diagrams: `01-context-map`, `02-domain-model`, `03-batch-lifecycle`.

## 1. Ubiquitous language

Use these words in code, UI, logs and the pitch. Never use synonyms.

| Term | Meaning | Code name |
|---|---|---|
| **Platform Authority** | Certapharm's own key. Owns the SAS Credential, accredits participants, raises alerts. | `PlatformAuthority` |
| **Participant** | A company in the supply chain with an on-chain identity (wallet) and a role. | `Participant` |
| **Role** | `MANUFACTURER`, `IMPORTER`, `DISTRIBUTOR`, `CARRIER`, `PHARMACY`. | `ParticipantRole` |
| **Accreditation** | The Platform Authority's signed statement that a wallet is a Participant with a Role. | `Accreditation` (SAS `participant` attestation) |
| **Product** | A medicine identified by its GTIN. | `Gtin` |
| **Batch** (lot) | A production lot of one product: GTIN + lot number. Unit of certification. | `Batch` |
| **Batch Key** | The deterministic address derived from GTIN + lot; the batch's identity everywhere on-chain. | `BatchKey` |
| **Certificate of Origin** | The SAS `batch` attestation signed by an accredited Manufacturer/Importer. | `CertificateOfOrigin` |
| **Custody Event** | A signed statement by a Participant that something happened to a batch: `SHIPPED`, `RECEIVED`, `STORED`, `DISPENSED`. | `CustodyEvent` |
| **Custody Trail** | The ordered list of a batch's custody events. | `CustodyTrail` |
| **Unit** | One physical box: GTIN + lot + serial. | `Unit` |
| **Unit Seal** | The compressed NFT minted for one unit. | `UnitSeal` |
| **Alert** | A regulatory flag on a batch: `RECALL`, `SUSPECTED_COUNTERFEIT`, `COLD_CHAIN_BREACH`, `REGULATOR_NOTICE`. | `BatchAlert` |
| **Verdict** | The answer the public gets: `AUTHENTIC`, `AUTHENTIC_WITH_ALERT`, `NOT_RECOGNIZED`. | `Verdict` |
| **Finding** | One machine-readable reason behind a verdict (e.g. `ALERT_RECALL`, `CUSTODY_SIGNER_NOT_ACCREDITED`). | `Finding` |
| **GS1 Digital Link** | The URL form of the code on the box: `/01/{gtin}/10/{lot}/21/{serial}`. | `Gs1DigitalLink` |

## 2. Bounded contexts

| # | Context | Type | Responsibility | Writes on-chain? |
|---|---|---|---|---|
| BC1 | **Accreditation** | Supporting | Who is allowed to act, with which role | Yes — SAS `participant` |
| BC2 | **Origin Certification** | **Core** | Register batches, issue / withdraw certificates of origin | Yes — SAS `batch` |
| BC3 | **Chain of Custody** | **Core** | Record and read signed custody events | Yes — memo txs |
| BC4 | **Unit Sealing** | Core (cuttable) | Mint and revoke one seal per unit | Yes — Bubblegum |
| BC5 | **Regulatory Alerts** | Supporting | Raise / clear alerts on batches | Yes — SAS `batch-alert` |
| BC6 | **Public Verification** | **Core** (read side) | Turn chain state into a verdict for a human | No — read only |
| SK | **GS1 Shared Kernel** | Shared kernel | `Gtin`, `LotNumber`, `SerialNumber`, `ExpiryDate`, `Gs1DigitalLink`, `BatchKey` | — |
| ACL | **Solana Anti-Corruption Layer** | Generic | Translates domain ⇄ SAS/Memo/Bubblegum/RPC/DAS | — |

### Context map (relationships)

- BC2, BC3, BC4, BC5 are **Customers** of BC1 (**Upstream/Supplier**): they need "is this wallet accredited with role X?".
- BC3, BC4, BC5 are **Conformists** to BC2's `BatchKey`: they reference a batch only by its key.
- BC6 is a **downstream read model** of BC1–BC5. It owns the `VerdictPolicy` and never writes.
- All contexts reach Solana **only through the ACL** (ports in `03-architecture.md`). Domain code never imports `sas-lib`, `@solana/kit` or Umi.
- All contexts share the **GS1 Shared Kernel**; changes to it need all contexts' tests green.

## 3. Shared kernel — value objects

All value objects are immutable, validated in a static `create()` that returns `Result<T, DomainError>`,
and compared by value.

| VO | Rules | Errors |
|---|---|---|
| `Gtin` | 8, 12, 13 or 14 digits; normalized to 14 with left zeros; GS1 mod-10 check digit valid | `GTIN_INVALID_LENGTH`, `GTIN_BAD_CHECK_DIGIT` |
| `LotNumber` | 1–20 chars, GS1 AI(10) charset `[!-"%-/0-9:-?A-Z_a-z]`; trimmed | `LOT_INVALID` |
| `SerialNumber` | 1–20 chars, GS1 AI(21) charset | `SERIAL_INVALID` |
| `ExpiryDate` | `YYMMDD` or ISO date; stored as UTC midnight epoch seconds; day `00` = last day of month | `EXPIRY_INVALID` |
| `BatchKey` | `derive(gtin, lot)` → Solana address (see `02-onchain-model.md §2`). Same input → same key, always. | — |
| `Gs1DigitalLink` | Parse `https://<host>/01/{gtin}/10/{lot}[/21/{serial}][?17={expiry}]`; also parse raw GS1 element strings `(01)…(10)…(21)…(17)…` | `LINK_UNPARSEABLE` |
| `CountryCode` | ISO 3166-1 alpha-2, uppercase | `COUNTRY_INVALID` |
| `LegalIdHash` | SHA-256 hex of the participant's CNPJ (digits only). Never store the raw CNPJ on-chain. | — |

## 4. Aggregates

Each aggregate is the consistency boundary for one transaction. Invariants are checked in the
aggregate **before** the ACL sends anything to Solana.

### 4.1 `Participant` (BC1)

```
Participant (root)
  wallet: WalletAddress          // identity
  role: ParticipantRole
  displayName: string (≤ 48)
  legalIdHash: LegalIdHash
  status: ACTIVE | REVOKED
  accreditedAt: Instant
```

Invariants
- P1. Only the `PlatformAuthority` can accredit or revoke.
- P2. One wallet holds exactly one active accreditation (one role).
- P3. A revoked participant cannot sign new certificates or custody events. Events signed **before** revocation stay valid.

Domain events: `ParticipantAccredited`, `ParticipantRevoked`.

### 4.2 `Batch` (BC2) — core

```
Batch (root)
  key: BatchKey                  // identity = derive(gtin, lot)
  gtin: Gtin
  lot: LotNumber
  expiry: ExpiryDate
  productName: string (≤ 64)
  dosage: string (≤ 32)
  countryOfManufacture: CountryCode
  issuer: WalletAddress          // the accredited manufacturer/importer that signed
  certificate: CertificateOfOrigin? // attestation address once issued
  status: DRAFT | CERTIFIED | WITHDRAWN | EXPIRED
```

Invariants
- B1. Issuer must hold an ACTIVE accreditation with role `MANUFACTURER` or `IMPORTER`.
- B2. `(gtin, lot)` is unique: a second `RegisterBatch` for the same key fails with `BATCH_ALREADY_CERTIFIED`.
- B3. `expiry` must be in the future at registration.
- B4. Only the original issuer can withdraw (enforced on-chain: each issuer has its own SAS credential). The Platform Authority uses an alert instead.
- B5. `EXPIRED` is derived (now > expiry), never written.

Domain events: `BatchCertified`, `BatchWithdrawn`.

### 4.3 `CustodyTrail` (BC3) — core

```
CustodyTrail (root)
  batchKey: BatchKey
  events: CustodyEvent[]         // ordered by slot, then tx index

CustodyEvent (entity)
  signature: TxSignature         // identity
  type: SHIPPED | RECEIVED | STORED | DISPENSED
  actor: WalletAddress
  actorRole: ParticipantRole     // resolved at read time
  occurredAt: Instant            // block time
  temperatureC?: number          // optional, -40..60
  locationHash?: string          // optional, SHA-256 of a site id
```

Invariants (write side)
- C1. Actor must hold an ACTIVE accreditation.
- C2. The batch must be `CERTIFIED` (not withdrawn, not expired) at write time.
- C3. Allowed `type` by role:

| Role | SHIPPED | RECEIVED | STORED | DISPENSED |
|---|---|---|---|---|
| MANUFACTURER / IMPORTER | ✓ | | ✓ | |
| DISTRIBUTOR | ✓ | ✓ | ✓ | |
| CARRIER | ✓ | ✓ | | |
| PHARMACY | | ✓ | ✓ | ✓ |

Read-side checks (become `Finding`s, not exceptions — the chain is append-only and anyone can post a memo):
- C4. Event signed by a non-accredited wallet → ignored + `CUSTODY_SIGNER_NOT_ACCREDITED`.
- C5. `RECEIVED` with no prior `SHIPPED` → `CUSTODY_GAP`.
- C6. Any event after `DISPENSED` count exceeds… (MVP: ignore; listed for later).
- C7. `temperatureC` outside product range (MVP: 2–8 °C if product is cold-chain) → `COLD_CHAIN_BREACH_REPORTED`.

Domain events: `CustodyEventRecorded`.

### 4.4 `UnitSeal` (BC4) — cuttable

```
UnitSeal (root)
  unit: { gtin, lot, serial }    // identity
  batchKey: BatchKey
  assetId: Address               // cNFT asset id
  tree: Address
  leafIndex: number
  status: SEALED | REVOKED
```

Invariants
- U1. Batch must be `CERTIFIED`.
- U2. One seal per `(gtin, lot, serial)`.
- U3. Only the batch issuer can seal or revoke (the issuer's wallet owns all leaves).

Domain events: `UnitSealed`, `UnitRevoked`.

### 4.5 `BatchAlert` (BC5)

```
BatchAlert (root)
  batchKey: BatchKey             // identity (one active alert per batch)
  level: RECALL | SUSPECTED_COUNTERFEIT | COLD_CHAIN_BREACH | REGULATOR_NOTICE
  reasonCode: string (≤ 32)      // e.g. "ANVISA-RE-1234/2026"
  publicNote: string (≤ 140)
  raisedBy: WalletAddress
  raisedAt: Instant
```

Invariants
- A1. MVP: only the Platform Authority can raise or clear an alert (an issuer's recall request goes through Certapharm). Post-MVP: issuer-raised `RECALL`.
- A2. At most one active alert per batch; raising again replaces it (close + create).

Domain events: `AlertRaised`, `AlertCleared`.

## 5. Public Verification (BC6) — the verdict policy

`VerdictPolicy` is a pure domain service: `(VerificationSnapshot) → VerificationReport`.
It has no I/O and is the most-tested function in the repo.

```
VerificationSnapshot
  query: { gtin, lot, serial? }
  certificate?: { issuer, issuerAccreditation?, expiry, withdrawn: boolean }
  alert?: { level, reasonCode, publicNote }
  trail: CustodyEvent[] (with actor accreditation resolved)
  seal?: { status } | "NOT_FOUND" | "NOT_CHECKED"
  now: Instant

VerificationReport
  verdict: Verdict
  findings: Finding[]
  batch?: public batch summary
  trail: public trail (accredited events only)
```

Rules, evaluated **in order**; the first matching `NOT_RECOGNIZED` rule wins:

| # | Condition | Verdict | Finding |
|---|---|---|---|
| R1 | No certificate for `BatchKey` | NOT_RECOGNIZED | `NO_CERTIFICATE` |
| R2 | Certificate issuer not accredited as MANUFACTURER/IMPORTER by the Platform Authority | NOT_RECOGNIZED | `ISSUER_NOT_ACCREDITED` |
| R3 | Serial given, seal phase enabled, and seal `NOT_FOUND` | NOT_RECOGNIZED | `UNIT_NOT_SEALED` |
| R4 | Seal `REVOKED` | NOT_RECOGNIZED | `UNIT_REVOKED` |
| R5 | Active alert | AUTHENTIC_WITH_ALERT | `ALERT_<LEVEL>` |
| R6 | `now > expiry` | AUTHENTIC_WITH_ALERT | `BATCH_EXPIRED` |
| R7 | Any C5/C7 read-side finding | AUTHENTIC_WITH_ALERT | that finding |
| R8 | Otherwise | AUTHENTIC | — |

Non-accredited custody memos (C4) are **dropped from the public trail** and reported as a finding,
but do not by themselves change the verdict (anyone can spam memos referencing a batch key).

## 6. Domain events (catalogue)

| Event | Emitted by | Payload | On-chain evidence |
|---|---|---|---|
| `ParticipantAccredited` | BC1 | wallet, role, legalIdHash | SAS `participant` attestation created |
| `ParticipantRevoked` | BC1 | wallet | attestation closed |
| `BatchCertified` | BC2 | batchKey, gtin, lot, issuer, attestation | SAS `batch` attestation created |
| `BatchWithdrawn` | BC2 | batchKey | attestation closed |
| `CustodyEventRecorded` | BC3 | batchKey, type, actor, signature | memo tx |
| `UnitSealed` | BC4 | unit, assetId, leafIndex | Bubblegum `mintV2` |
| `UnitRevoked` | BC4 | unit, assetId | Bubblegum `burnV2` |
| `AlertRaised` / `AlertCleared` | BC5 | batchKey, level | SAS `batch-alert` created / closed |

In the MVP, domain events are in-process (a typed `EventBus` with sync handlers) and are used for
logging and for updating the small off-chain projection (`serial → leafIndex`). The chain is the
source of truth; every projection must be rebuildable from it.

## 7. Acceptance criteria

- [ ] `Gtin.create("2001234567893")` succeeds and normalizes to `02001234567893`; a wrong check digit fails with `GTIN_BAD_CHECK_DIGIT`.
- [ ] `BatchKey.derive(gtin, lot)` returns the same address across processes and machines.
- [ ] `VerdictPolicy` has one unit test per rule R1–R8, plus: "non-accredited memo is dropped but verdict stays AUTHENTIC".
- [ ] No file under `domain/` imports from `@solana/*`, `sas-lib` or `@metaplex-foundation/*` (enforced by an ESLint `no-restricted-imports` rule).
