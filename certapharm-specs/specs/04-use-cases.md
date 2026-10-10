# 04 — Use Cases (Application Services)

Diagrams: `04-seq-register-batch`, `05-seq-custody-event`, `06-seq-verify`.

Every use case is a class with one `execute(input): Promise<Result<Output, Error>>` method, lives in
`packages/application/src/use-cases/`, and is exposed as one CLI command. Tests use in-memory fakes
for every port.

| # | Use case | Actor | CLI command | Priority |
|---|---|---|---|---|
| UC1 | BootstrapPlatform | Platform Authority | `cph platform:init` | Core |
| UC2 | AccreditParticipant | Platform Authority | `cph participant:accredit` | Core |
| UC3 | OnboardIssuer | Manufacturer / Importer | `cph issuer:onboard` | Core |
| UC4 | RegisterBatch | Manufacturer / Importer | `cph batch:register` | Core |
| UC5 | RecordCustodyEvent | Any accredited participant | `cph custody:record` | Core |
| UC6 | VerifyProduct | Public (anyone) | `cph verify <link>` + web | Core |
| UC7 | SealUnits | Manufacturer / Importer | `cph units:seal` | Cut #3 |
| UC8 | RaiseAlert / ClearAlert | Platform Authority | `cph alert:raise` / `alert:clear` | Cut #2 (keep CLI, drop UI) |
| UC9 | WithdrawBatch | Issuer | `cph batch:withdraw` | Cut #1 |
| UC10 | SeedDemo | Developer | `cph demo:seed` | Core (for the video) |

---

## UC1 — BootstrapPlatform

**Input:** none (uses `PLATFORM_SECRET`).
**Steps:** create Platform credential `certapharm` (signers = [platform]) → create schemas `participant` v1 and `batch-alert` v1. Each step skipped if the PDA already exists (idempotent).
**Output:** `{ platformCredential, participantSchema, alertSchema, signatures[] }`.

- Given an empty devnet wallet with ≥ 1 SOL, When `cph platform:init` runs twice, Then the second run sends no transactions and prints the same addresses.

## UC2 — AccreditParticipant

**Input:** `{ wallet, role, displayName, cnpj }`.
**Preconditions:** P1 (platform signs). P2 (wallet not already accredited).
**Steps:** validate → `legalIdHash = sha256(cnpj digits)` → `AccreditationRegistry.accredit` → publish `ParticipantAccredited`.
**Errors:** `ALREADY_ACCREDITED`, `ROLE_INVALID`, `CNPJ_INVALID` (14 digits, valid check digits).

- Given a new wallet, When accredited as DISTRIBUTOR, Then `find(wallet)` returns role DISTRIBUTOR, signer = Platform Authority.
- Given an accredited wallet, When accredited again, Then `ALREADY_ACCREDITED` and no tx is sent.
- The raw CNPJ never appears in any transaction or log.

## UC3 — OnboardIssuer

**Input:** issuer signer.
**Preconditions:** issuer accredited as MANUFACTURER or IMPORTER.
**Steps:** `IssuerOnboarding.ensureIssuerCredential` → creates `certapharm-issuer` credential (signers = [issuer]) and `batch` v1 schema. Idempotent. Fee payer may be the platform.
**Errors:** `NOT_AN_ISSUER`.

- Given an accredited PHARMACY, When onboarding, Then `NOT_AN_ISSUER`.

## UC4 — RegisterBatch (core)

**Input:** `{ issuer, gtin, lot, expiry, productName, dosage, country }`.
**Steps:**
1. Build VOs (`Gtin`, `LotNumber`, `ExpiryDate`, `CountryCode`); fail fast.
2. `issuerAcc = AccreditationRegistry.find(issuer)` → B1.
3. `batchKey = BatchKeyDeriver.derive(gtin, lot)`.
4. `CertificateRegistry.findByBatchKey(batchKey, [issuerAcc])` → B2.
5. `Batch.certify(...)` checks B3 and returns `BatchCertified`.
6. `CertificateRegistry.issue(issuer, batch)`.
7. Publish `BatchCertified`; print the verify URL `${PUBLIC_BASE_URL}/01/${gtin}/10/${lot}`.

**Errors:** `ISSUER_NOT_ACCREDITED`, `BATCH_ALREADY_CERTIFIED`, `EXPIRY_IN_PAST`, VO errors.

- Given an onboarded manufacturer, When registering GTIN `02001234567893` lot `L2026A`, Then the attestation exists at `deriveAttestationPda(issuerCredential, batchSchema, batchKey)` and deserializes to the same fields.
- Given a non-accredited wallet, When registering, Then `ISSUER_NOT_ACCREDITED` and no tx is sent.
- Given the same `(gtin, lot)` twice, Then the second fails with `BATCH_ALREADY_CERTIFIED`.

## UC5 — RecordCustodyEvent (core)

**Input:** `{ actor, gtin, lot, type, temperatureC?, siteId? }`.
**Steps:**
1. VOs → `batchKey`.
2. `acc = find(actor)` → C1; check role/type matrix → C3.
3. Certificate exists and is not expired → C2 (`listIssuers()` + `findByBatchKey`).
4. `locationHash = sha256(siteId).slice(0, 8)` if given.
5. `CustodyLedger.record(actor, …)` → publish `CustodyEventRecorded`.

**Errors:** `ACTOR_NOT_ACCREDITED`, `EVENT_NOT_ALLOWED_FOR_ROLE`, `BATCH_NOT_CERTIFIED`, `TEMPERATURE_OUT_OF_RANGE` (outside −40..60).

- Given an accredited DISTRIBUTOR and a certified batch, When recording RECEIVED then SHIPPED, Then `readTrail(batchKey)` returns both in order with the distributor as actor.
- Given a PHARMACY, When recording SHIPPED, Then `EVENT_NOT_ALLOWED_FOR_ROLE`.
- The memo text matches `^cph1 \{.*\}$` and is ≤ 400 bytes.

## UC6 — VerifyProduct (core, read-only)

**Input:** a `Gs1DigitalLink` (URL path or raw GS1 element string).
**Steps (parallelize where independent):**
1. Parse link → `gtin, lot, serial?` (fail → 400 `LINK_UNPARSEABLE`).
2. `batchKey = derive(gtin, lot)`.
3. In parallel: `issuers = listIssuers()` → `certificate = findByBatchKey(batchKey, issuers)`; `alert = AlertRegistry.find(batchKey)`; `raw = CustodyLedger.readTrail(batchKey)`.
4. Resolve accreditation of every distinct memo signer with `findMany`.
5. If `serial` and `SEALS_ENABLED`: `SealReader.status(unit)`; else `NOT_CHECKED`.
6. Build `VerificationSnapshot` → `VerdictPolicy.evaluate` → `VerificationReport`.

**Performance:** p95 < 2 s on devnet with ≤ 20 custody events. Cache `listIssuers` 60 s and whole reports 15 s per `(gtin, lot, serial)`.

- Given a certified batch with 3 accredited events, Then `AUTHENTIC`.
- Given the same batch plus an alert RECALL, Then `AUTHENTIC_WITH_ALERT` with finding `ALERT_RECALL` and the public note.
- Given an unknown `(gtin, lot)`, Then `NOT_RECOGNIZED` / `NO_CERTIFICATE`.
- Given a batch certified by a wallet whose accreditation was revoked, Then `NOT_RECOGNIZED` / `ISSUER_NOT_ACCREDITED`.
- Given a memo for the batch signed by a random wallet, Then it is excluded from the trail, finding `CUSTODY_SIGNER_NOT_ACCREDITED` is present, verdict unchanged.

## UC7 — SealUnits (cut #3)

**Input:** `{ issuer, gtin, lot, serials: string[] (≤ 50 per call) }`.
**Steps:** batch certified by this issuer (U1, U3) → for each serial not already in `SealIndex` (U2): `SealMinter.seal` → `SealIndex.put` → `UnitSealed`. Continue on per-unit failure and report a summary.

- Given 10 serials, Then 10 rows in `unit_seals` and DAS `getAsset` finds each.
- Re-running with the same serials sends no transactions.

## UC8 — RaiseAlert / ClearAlert (cut #2: keep CLI)

**Input:** `{ gtin, lot, level, reasonCode, publicNote }` / `{ gtin, lot }`.
**Steps:** A1 (platform signs) → raise = close existing (if any) + create in one tx; clear = close.

- Given a certified batch, When raising RECALL, Then UC6 returns `AUTHENTIC_WITH_ALERT` within one cache window (15 s).

## UC9 — WithdrawBatch (cut #1)

Issuer closes its own `batch` attestation (B4). UC6 then returns `NOT_RECOGNIZED`.

## UC10 — SeedDemo

Creates (or reuses) the demo world for the video, idempotently:

1. Keys: `platform`, `labX` (MANUFACTURER, "Laboratório Demo"), `distY` (DISTRIBUTOR), `carrierZ` (CARRIER), `pharmaW` (PHARMACY). Airdrop / transfer devnet SOL.
2. UC1 → UC2 ×4 → UC3 (`labX`).
3. Batch A `02001234567893 / L2026A` → custody: labX SHIPPED → carrierZ RECEIVED (4.6 °C) → carrierZ SHIPPED → distY RECEIVED → distY SHIPPED → pharmaW RECEIVED → pharmaW DISPENSED. **Expect AUTHENTIC.**
4. Batch B `02001234567893 / L2026B` → same trail + alert RECALL `ANVISA-DEMO-001`. **Expect AUTHENTIC_WITH_ALERT.**
5. Batch C `02001234567893 / L2026X` → **never registered.** **Expect NOT_RECOGNIZED.**
6. (if seals) seal serials `0001..0010` of batch A.
7. Print three QR codes (PNG) and their URLs to `./demo/`.

All GTINs and names are fictitious (prefix `200` is GS1 restricted circulation, so it cannot collide with a real product). No real lot numbers, no customer data.
