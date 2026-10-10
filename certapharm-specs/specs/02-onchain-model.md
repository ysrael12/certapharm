# 02 — On-chain Model (SAS + Memo + Bubblegum)

Diagram: `08-onchain-accounts`. Cluster: **devnet**. All addresses below are derived, never hard-coded,
except program IDs.

| Program | Address |
|---|---|
| Solana Attestation Service | `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG` (`SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS` in `sas-lib`) |
| Memo v2 | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| System | `11111111111111111111111111111111` |
| Bubblegum / compression | from `mplBubblegum()` Umi plugin |

## 1. Trust design: two kinds of SAS credentials

SAS lets **any authorized signer of a credential create or close any attestation under it**. So we
never put two companies on one credential. Instead:

| Credential | Authority / signers | Schemas under it | Who writes |
|---|---|---|---|
| **Platform credential** `certapharm` | Platform Authority only | `participant` v1, `batch-alert` v1 | Platform Authority |
| **Issuer credential** `certapharm-issuer` (one per manufacturer/importer) | That issuer's wallet only | `batch` v1 | That issuer |

Consequence: a manufacturer can only create or withdraw **its own** batches; only Certapharm can accredit
and raise alerts. The verifier trusts a batch only if its issuer credential belongs to a wallet that holds
a `participant` attestation **signed by the Platform Authority** with role MANUFACTURER or IMPORTER.

```ts
import { deriveCredentialPda, deriveSchemaPda, deriveAttestationPda } from "sas-lib";

const [platformCredential] = await deriveCredentialPda({ authority: PLATFORM, name: "certapharm" });
const [issuerCredential]   = await deriveCredentialPda({ authority: issuerWallet, name: "certapharm-issuer" });
const [participantSchema]  = await deriveSchemaPda({ credential: platformCredential, name: "participant", version: 1 });
const [alertSchema]        = await deriveSchemaPda({ credential: platformCredential, name: "batch-alert", version: 1 });
const [batchSchema]        = await deriveSchemaPda({ credential: issuerCredential,   name: "batch", version: 1 });
```

> The schema PDA's `version` seed is the number passed to `deriveSchemaPda`. A fresh schema starts at
> version 1; confirm in spike **S1** by fetching the created schema with `fetchSchema` and reading `.version`.

## 2. BatchKey — deterministic identity for a batch

```ts
import { getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";

export async function deriveBatchKey(gtin14: string, lot: string): Promise<Address> {
  const utf8 = getUtf8Encoder();
  const [key] = await getProgramDerivedAddress({
    programAddress: SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS, // namespace only, nothing is created
    seeds: [utf8.encode("certapharm:batch:v1"), utf8.encode(gtin14), utf8.encode(lot)],
  });
  return key;
}
```

- `gtin14` is the normalized 14-digit GTIN; `lot` is the exact AI(10) string (case-sensitive, ≤ 20 bytes).
- The BatchKey is used as: the **nonce** of the `batch` and `batch-alert` attestations, and the
  **reference key** of every custody-event transaction. One key ties the whole history together.
- No account ever exists at the BatchKey address.

## 3. Schemas (exact layouts)

SAS layout bytes (from `sas-lib` `compactLayoutMapping`): `0=u8, 3=u64, 8=i64, 12=String, 13=Vec<u8>`.

### 3.1 `participant` v1 — under Platform credential

| Field | Layout | Notes |
|---|---|---|
| `role` | `0` u8 | 1 MANUFACTURER, 2 IMPORTER, 3 DISTRIBUTOR, 4 CARRIER, 5 PHARMACY |
| `display_name` | `12` String | ≤ 48 bytes, public |
| `legal_id_hash` | `12` String | hex SHA-256 of CNPJ digits |

- `layout = [0, 12, 12]`, `fieldNames = ["role","display_name","legal_id_hash"]`
- **nonce = participant wallet** → PDA `deriveAttestationPda({credential: platformCredential, schema: participantSchema, nonce: wallet})`
- `expiry` = now + 365 days (unix seconds)
- Revoke = `getCloseAttestationInstruction`

### 3.2 `batch` v1 — under each Issuer credential

| Field | Layout | Notes |
|---|---|---|
| `gtin` | `12` String | 14 digits |
| `lot` | `12` String | AI(10) |
| `expiry` | `8` i64 | unix seconds, product expiry |
| `product_name` | `12` String | ≤ 64 bytes |
| `dosage` | `12` String | ≤ 32 bytes |
| `country` | `12` String | ISO alpha-2 |

- `layout = [12, 12, 8, 12, 12, 12]`
- **nonce = BatchKey**
- attestation `expiry` = product expiry + 2 years (keeps the certificate readable for audit after the product expires; product expiry lives in the data)
- Withdraw = close attestation (issuer signs)

### 3.3 `batch-alert` v1 — under Platform credential

| Field | Layout | Notes |
|---|---|---|
| `level` | `0` u8 | 1 RECALL, 2 SUSPECTED_COUNTERFEIT, 3 COLD_CHAIN_BREACH, 4 REGULATOR_NOTICE |
| `reason_code` | `12` String | ≤ 32 bytes, e.g. `ANVISA-RE-1234/2026` |
| `public_note` | `12` String | ≤ 140 bytes, shown to the public |
| `raised_at` | `8` i64 | unix seconds |

- `layout = [0, 12, 12, 8]`, **nonce = BatchKey**, `expiry` = now + 5 years
- Clear = close attestation. Replace = close + create in one transaction.
- MVP: only the Platform Authority raises alerts (an issuer requesting a recall goes through Certapharm).

### 3.4 Writing and reading data

```ts
import { fetchSchema, serializeAttestationData, deserializeAttestationData,
         getCreateAttestationInstruction, fetchMaybeAttestation } from "sas-lib";

const schema = await fetchSchema(rpc, batchSchema);
const data = serializeAttestationData(schema.data, { gtin, lot, expiry: BigInt(exp), product_name, dosage, country });
const [attestation] = await deriveAttestationPda({ credential: issuerCredential, schema: batchSchema, nonce: batchKey });
const ix = getCreateAttestationInstruction({
  payer, authority: issuerSigner, credential: issuerCredential, schema: batchSchema,
  attestation, nonce: batchKey, data, expiry: certExpiry,
});
// read
const maybe = await fetchMaybeAttestation(rpc, attestation);
if (maybe.exists) deserializeAttestationData(schema.data, Uint8Array.from(maybe.data.data));
```

> Check the exact `serializeAttestationData` value types for `i64` (bigint vs number) in spike **S1**.

## 4. Custody event transaction

A custody event is **one transaction, two instructions**, signed by the actor (fee payer may be the
Platform Authority to sponsor fees):

1. **Reference instruction** — `SystemProgram.transfer` of **0 lamports** from the actor to the actor,
   with the `BatchKey` appended as an extra **read-only, non-signer** account (the Solana Pay "reference"
   pattern). This makes the transaction show up in `getSignaturesForAddress(batchKey)`.
2. **Memo instruction** — Memo v2 with the actor as a **read-only signer**:

```ts
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
function memoIx(actor: TransactionSigner, text: string): Instruction {
  return {
    programAddress: MEMO_PROGRAM,
    accounts: [{ address: actor.address, role: AccountRole.READONLY_SIGNER, signer: actor }],
    data: getUtf8Encoder().encode(text),
  };
}
```

### Memo wire format `cph1`

```
cph1 {"t":"RECEIVED","b":"<BatchKey>","g":"02001234567893","l":"L2026A","tc":4.5,"loc":"9f2c1a0b"}
```

| Key | Required | Meaning |
|---|---|---|
| `t` | ✓ | `SHIPPED` \| `RECEIVED` \| `STORED` \| `DISPENSED` |
| `b` | ✓ | BatchKey (base58) — must equal the reference key in instruction 1 |
| `g`, `l` | ✓ | GTIN-14 and lot (lets an auditor read the memo without our code) |
| `tc` | | temperature °C, one decimal |
| `loc` | | first 8 hex chars of SHA-256(site id) — no addresses on-chain |

- Prefix `cph1 ` + compact JSON, **≤ 400 bytes**. No personal data, ever.
- Reader: parse from `meta.logMessages` line `Program log: Memo (len N): "<text>"` or from the
  memo instruction data in `jsonParsed` encoding. Reject entries where `b` ≠ the queried BatchKey.
- The **actor** of the event is the memo's signer (not the fee payer).

> **Spike S2 (do first):** confirm that the 0-lamport self-transfer with an extra read-only account
> lands on devnet and is returned by `getSignaturesForAddress(batchKey)`. **Fallback if it fails:**
> send the memo alone and append the signature to an off-chain projection table
> `custody_index(batch_key, signature)`; the event is still public and verifiable on any explorer.

## 5. Unit seals (Bubblegum V2) — cuttable

- One Merkle tree **per issuer**, created on first use with `createTreeV2(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 })` (16,384 units; enough for the demo). Tree creator = issuer.
- Mint with `mintV2(umi, { leafOwner: issuer, merkleTree, metadata })`; the issuer keeps every leaf (the consumer never holds a token).
- Metadata:
  - `name`: `CPH ${lot}-${serial}` (≤ 32 bytes)
  - `symbol`: `CPH`
  - `uri`: `${PUBLIC_BASE_URL}/api/seal/${gtin}/${lot}/${serial}.json` (served by our app; returns `{ gtin, lot, serial, batchKey }`)
  - `sellerFeeBasisPoints: 0`, no creators, no collection
- After confirmation: `parseLeafFromMintV2Transaction(umi, signature)` → `leafIndex`, then
  `findLeafAssetIdPda(umi, { merkleTree, leafIndex })` → `assetId`. Store in projection `unit_seals`.
- Verify: DAS `getAsset(assetId)` → `compression.compressed === true`, `burnt === false`.
  Requires an RPC with the DAS API (Helius or Triton devnet; public devnet RPC does **not** serve DAS).
- Revoke unit: `getAssetWithProof` then `burnV2` (issuer is leaf owner).

## 6. Read path summary (what the verifier fetches)

| Step | Call | Count |
|---|---|---|
| 1 | Accredited issuers: `getProgramAccounts(SAS, memcmp schema = participantSchema)`; decode; keep signer = Platform Authority and role ∈ {1,2}. **Cached 60 s.** | 1 (cached) |
| 2 | For each issuer: derive issuer credential → batch schema → attestation PDA with nonce BatchKey; `getMultipleAccounts` | 1 |
| 3 | Alert PDA (platform credential, alert schema, nonce BatchKey): `fetchMaybeAttestation` | 1 (batched with 2) |
| 4 | `getSignaturesForAddress(batchKey, { limit: 100 })` then `getTransaction` in parallel | 1 + N |
| 5 | Actor accreditation: participant PDAs for each memo signer, `getMultipleAccounts` | 1 |
| 6 | (if serial & seals on) projection lookup → DAS `getAsset` | 1 |

> `memcmp` offset for the `schema` field in an Attestation account: `1 (discriminator) + 32 (nonce) + 32 (credential) = 65`. Confirm in spike **S1** against a real fetched account before relying on it; fallback is a static allowlist of issuer wallets in config.

## 7. Spikes to run before writing features (≤ 45 min total)

| Spike | Proves | Done when |
|---|---|---|
| S1 | SAS end-to-end with `sas-lib` + kit 5.5 | Script creates platform credential, `participant` schema, one attestation; reads it back and deserializes |
| S2 | Custody reference pattern | A memo tx with the reference key appears in `getSignaturesForAddress(batchKey)` |
| S3 | Bubblegum V2 on devnet with DAS RPC | Tree created, one leaf minted, `getAsset` returns it |
