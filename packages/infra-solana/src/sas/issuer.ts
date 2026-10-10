import type { Address } from "@solana/kit";
import {
  deriveAttestationPda, deriveCredentialPda, deriveSchemaPda, deserializeAttestationData, fetchAllMaybeAttestation, fetchSchema,
  getCloseAttestationInstruction, getCreateAttestationInstruction, getCreateCredentialInstruction,
  getCreateSchemaInstruction, serializeAttestationData,
} from "sas-lib";
import type {
  CertificateRecord, CertificateRegistry, IssuerCredential, IssuerOnboarding, SignerRef, TxRef,
} from "@certapharm/application";
import { DAY, type Batch, type BatchKey, type Clock, type ExpiryDate, type Gtin, type LotNumber, type WalletAddress } from "@certapharm/domain";
import type { Keyring } from "../keys.js";
import type { SolanaRpc, TxSender } from "../rpc.js";
import { ISSUER_CREDENTIAL_NAME, LAYOUT, SCHEMA_VERSION, accountExists, asAddress, asWallet, isLive } from "./common.js";

const CERTIFICATE_GRACE = 2 * 365 * DAY; // attestation outlives the product expiry so audits still work (spec 02 §3.2)

async function issuerAddresses(issuer: string) {
  const [credential] = await deriveCredentialPda({ authority: asAddress(issuer), name: ISSUER_CREDENTIAL_NAME });
  const [batchSchema] = await deriveSchemaPda({ credential, name: "batch", version: SCHEMA_VERSION });
  return { credential, batchSchema };
}

/** UC3: one credential per issuer, signed only by that issuer, holding the `batch` schema. */
export class SasIssuerOnboarding implements IssuerOnboarding {
  constructor(private readonly rpc: SolanaRpc, private readonly sender: TxSender, private readonly keyring: Keyring) {}

  async ensureIssuerCredential(issuer: SignerRef): Promise<IssuerCredential> {
    const signer = this.keyring.get(issuer.address);
    const { credential, batchSchema } = await issuerAddresses(issuer.address);
    const payer = this.sender.payer;
    const signatures: string[] = [];
    if (!(await accountExists(this.rpc, credential))) {
      signatures.push((await this.sender.send([getCreateCredentialInstruction({
        payer, credential, authority: signer, name: ISSUER_CREDENTIAL_NAME, signers: [signer.address],
      })])).signature);
    }
    if (!(await accountExists(this.rpc, batchSchema))) {
      signatures.push((await this.sender.send([getCreateSchemaInstruction({
        payer, authority: signer, credential, schema: batchSchema, name: "batch", description: "Certapharm certificate of origin",
        layout: new Uint8Array([LAYOUT.STRING, LAYOUT.STRING, LAYOUT.I64, LAYOUT.STRING, LAYOUT.STRING, LAYOUT.STRING]),
        fieldNames: ["gtin", "lot", "expiry", "product_name", "dosage", "country"],
      })])).signature);
    }
    return { credential, batchSchema, signatures };
  }
}

type BatchData = { gtin: string; lot: string; expiry: bigint | number; product_name: string; dosage: string; country: string };

/** `batch` attestations: nonce = BatchKey, one credential per issuer. */
export class SasCertificateRegistry implements CertificateRegistry {
  constructor(
    private readonly rpc: SolanaRpc,
    private readonly sender: TxSender,
    private readonly keyring: Keyring,
    private readonly clock: Clock,
  ) {}

  async issue(issuer: SignerRef, batch: Batch): Promise<TxRef & { attestation: string }> {
    const signer = this.keyring.get(issuer.address);
    const { credential, batchSchema } = await issuerAddresses(issuer.address);
    const schema = await fetchSchema(this.rpc, batchSchema);
    const nonce = asAddress(batch.key);
    const [attestation] = await deriveAttestationPda({ credential, schema: batchSchema, nonce });
    const data = serializeAttestationData(schema.data, {
      gtin: batch.gtin, lot: batch.lot, expiry: BigInt(batch.expiry), product_name: batch.productName,
      dosage: batch.dosage, country: batch.countryOfManufacture,
    });
    const tx = await this.sender.send([getCreateAttestationInstruction({
      payer: this.sender.payer, authority: signer, credential, schema: batchSchema, attestation, nonce, data,
      expiry: BigInt(batch.expiry + CERTIFICATE_GRACE),
    })]);
    return { ...tx, attestation };
  }

  async withdraw(issuer: SignerRef, batchKey: BatchKey): Promise<TxRef> {
    const signer = this.keyring.get(issuer.address);
    const { credential, batchSchema } = await issuerAddresses(issuer.address);
    const [attestation] = await deriveAttestationPda({ credential, schema: batchSchema, nonce: asAddress(batchKey) });
    return this.sender.send([getCloseAttestationInstruction({
      payer: this.sender.payer, authority: signer, credential, attestation,
    })]);
  }

  async findByBatchKey(batchKey: BatchKey, issuers: readonly WalletAddress[]): Promise<CertificateRecord | null> {
    if (issuers.length === 0) return null;
    const wallets = [...new Set(issuers)];
    const addrs = await Promise.all(wallets.map(async (w) => {
      const { credential, batchSchema } = await issuerAddresses(w);
      const [attestation] = await deriveAttestationPda({ credential, schema: batchSchema, nonce: asAddress(batchKey) });
      return { wallet: w, batchSchema, attestation };
    }));
    const accounts = await fetchAllMaybeAttestation(this.rpc, addrs.map((a) => a.attestation as Address));
    for (const [i, acc] of accounts.entries()) {
      const hit = addrs[i];
      if (!hit || !acc.exists) continue;
      // The credential PDA already ties the attestation to this issuer, but the signer must match too.
      if (acc.data.signer !== (hit.wallet as string) || !isLive(acc.data.expiry, this.clock.now())) continue;
      const schema = await fetchSchema(this.rpc, hit.batchSchema);
      const d = deserializeAttestationData(schema.data, Uint8Array.from(acc.data.data)) as unknown as BatchData;
      return {
        issuer: asWallet(hit.wallet), attestation: acc.address, gtin: d.gtin as Gtin, lot: d.lot as LotNumber,
        expiry: Number(d.expiry) as ExpiryDate, productName: d.product_name, dosage: d.dosage, country: d.country,
      };
    }
    return null;
  }
}
