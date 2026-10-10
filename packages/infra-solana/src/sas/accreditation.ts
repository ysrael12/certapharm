import { type Address, type KeyPairSigner } from "@solana/kit";
import {
  deriveAttestationPda, deriveCredentialPda, deriveSchemaPda, deserializeAttestationData, fetchAllMaybeAttestation,
  fetchSchema, getAttestationDecoder, getCloseAttestationInstruction,
  getCreateAttestationInstruction, serializeAttestationData, SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
} from "sas-lib";
import type { AccreditationRegistry, TxRef } from "@certapharm/application";
import { DAY, type Clock, type LegalIdHash, type Participant, type WalletAddress } from "@certapharm/domain";
import type { SolanaRpc, TxSender } from "../rpc.js";
import { PLATFORM_CREDENTIAL_NAME, ROLE_BY_CODE, ROLE_CODE, SCHEMA_VERSION, asAddress, asWallet, isLive } from "./common.js";

const ACCREDITATION_VALIDITY = 365 * DAY;
const SCHEMA_FIELD_OFFSET = 65; // discriminator (1) + nonce (32) + credential (32), confirmed in spike S1
const ISSUERS_TTL_MS = 60_000;

type Decoded = { role: number; display_name: string; legal_id_hash: string };

/** `participant` attestations under the Platform credential. The Platform Authority is the only signer. */
export class SasAccreditationRegistry implements AccreditationRegistry {
  private ctx: Promise<{ credential: Address; schema: Address; schemaData: Awaited<ReturnType<typeof fetchSchema>>["data"] }> | undefined;
  private issuers: { at: number; list: Participant[] } | undefined;

  constructor(
    private readonly rpc: SolanaRpc,
    private readonly sender: TxSender,
    private readonly platform: KeyPairSigner,
    private readonly clock: Clock,
  ) {}

  private context() {
    this.ctx ??= (async () => {
      const [credential] = await deriveCredentialPda({ authority: this.platform.address, name: PLATFORM_CREDENTIAL_NAME });
      const [schema] = await deriveSchemaPda({ credential, name: "participant", version: SCHEMA_VERSION });
      const fetched = await fetchSchema(this.rpc, schema);
      return { credential, schema, schemaData: fetched.data };
    })();
    this.ctx.catch(() => { this.ctx = undefined; }); // do not cache a failure (e.g. before UC1 ran)
    return this.ctx;
  }

  private toParticipant(
    att: { nonce: Address; signer: Address; expiry: bigint; data: ArrayLike<number> },
    schemaData: Parameters<typeof deserializeAttestationData>[0],
  ): Participant | null {
    if (att.signer !== this.platform.address || !isLive(att.expiry, this.clock.now())) return null;
    const d = deserializeAttestationData(schemaData, Uint8Array.from(att.data)) as unknown as Decoded;
    const role = ROLE_BY_CODE[Number(d.role)];
    if (!role) return null;
    return {
      wallet: asWallet(att.nonce), role, displayName: d.display_name, legalIdHash: d.legal_id_hash as LegalIdHash,
      status: "ACTIVE", accreditedAt: Number(att.expiry) - ACCREDITATION_VALIDITY,
    };
  }

  async accredit(p: Participant): Promise<TxRef> {
    const { credential, schema, schemaData } = await this.context();
    const nonce = asAddress(p.wallet);
    const [attestation] = await deriveAttestationPda({ credential, schema, nonce });
    const data = serializeAttestationData(schemaData, {
      role: ROLE_CODE[p.role], display_name: p.displayName, legal_id_hash: p.legalIdHash,
    });
    this.issuers = undefined;
    return this.sender.send([getCreateAttestationInstruction({
      payer: this.sender.payer, authority: this.platform, credential, schema, attestation, nonce, data,
      expiry: BigInt(p.accreditedAt + ACCREDITATION_VALIDITY),
    })]);
  }

  async revoke(wallet: WalletAddress): Promise<TxRef> {
    const { credential, schema } = await this.context();
    const [attestation] = await deriveAttestationPda({ credential, schema, nonce: asAddress(wallet) });
    this.issuers = undefined;
    return this.sender.send([getCloseAttestationInstruction({
      payer: this.sender.payer, authority: this.platform, credential, attestation,
    })]);
  }

  async find(wallet: WalletAddress): Promise<Participant | null> {
    return (await this.findMany([wallet])).get(wallet) ?? null;
  }

  async findMany(wallets: readonly WalletAddress[]): Promise<Map<WalletAddress, Participant>> {
    const found = new Map<WalletAddress, Participant>();
    if (wallets.length === 0) return found;
    const { credential, schema, schemaData } = await this.context();
    const unique = [...new Set(wallets)];
    const pdas = await Promise.all(unique.map(async (w) => (await deriveAttestationPda({ credential, schema, nonce: asAddress(w) }))[0]));
    const accounts = await fetchAllMaybeAttestation(this.rpc, pdas);
    for (const acc of accounts) {
      if (!acc.exists) continue;
      const p = this.toParticipant(acc.data, schemaData);
      if (p) found.set(p.wallet, p);
    }
    return found;
  }

  /** `getProgramAccounts` filtered by the participant schema. Cached for 60 s. */
  async listIssuers(): Promise<Participant[]> {
    if (this.issuers && Date.now() - this.issuers.at < ISSUERS_TTL_MS) return this.issuers.list;
    const { schema, schemaData } = await this.context();
    const accounts = await this.rpc.getProgramAccounts(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS, {
      encoding: "base64",
      filters: [{ memcmp: { offset: BigInt(SCHEMA_FIELD_OFFSET), bytes: schema as never, encoding: "base58" } }],
    }).send();
    const decoder = getAttestationDecoder();
    const list: Participant[] = [];
    for (const a of accounts) {
      const att = decoder.decode(Buffer.from(a.account.data[0], "base64"));
      const p = this.toParticipant(att, schemaData);
      if (p && (p.role === "MANUFACTURER" || p.role === "IMPORTER")) list.push(p);
    }
    this.issuers = { at: Date.now(), list };
    return list;
  }
}

