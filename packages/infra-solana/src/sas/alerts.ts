import type { Address, KeyPairSigner } from "@solana/kit";
import {
  deriveAttestationPda, deriveCredentialPda, deriveSchemaPda, deserializeAttestationData, fetchMaybeAttestation, fetchSchema,
  getCloseAttestationInstruction, getCreateAttestationInstruction, serializeAttestationData,
} from "sas-lib";
import type { AlertRegistry, TxRef } from "@certapharm/application";
import type { AlertLevel, BatchAlert, BatchKey, Clock, WalletAddress } from "@certapharm/domain";
import type { SolanaRpc, TxSender } from "../rpc.js";
import { PLATFORM_CREDENTIAL_NAME, SCHEMA_VERSION, asAddress, asWallet, isLive } from "./common.js";

const LEVEL_CODE: Readonly<Record<AlertLevel, number>> = { RECALL: 1, SUSPECTED_COUNTERFEIT: 2, COLD_CHAIN_BREACH: 3, REGULATOR_NOTICE: 4 };
const LEVEL_BY_CODE = Object.fromEntries(Object.entries(LEVEL_CODE).map(([l, c]) => [c, l as AlertLevel])) as Record<number, AlertLevel>;

type Decoded = { level: number; reason_code: string; public_note: string; raised_at: bigint | number };

/** `batch-alert` attestations under the Platform credential: nonce = BatchKey, at most one per batch (A2). */
export class SasAlertRegistry implements AlertRegistry {
  constructor(
    private readonly rpc: SolanaRpc,
    private readonly sender: TxSender,
    private readonly platform: KeyPairSigner,
    private readonly clock: Clock,
  ) {}

  private async context(batchKey: BatchKey) {
    const [credential] = await deriveCredentialPda({ authority: this.platform.address, name: PLATFORM_CREDENTIAL_NAME });
    const [schema] = await deriveSchemaPda({ credential, name: "batch-alert", version: SCHEMA_VERSION });
    const nonce = asAddress(batchKey);
    const [attestation] = await deriveAttestationPda({ credential, schema, nonce });
    return { credential, schema, nonce, attestation };
  }

  async raise(a: BatchAlert): Promise<TxRef> {
    const { credential, schema, nonce, attestation } = await this.context(a.batchKey);
    const schemaData = (await fetchSchema(this.rpc, schema)).data;
    const data = serializeAttestationData(schemaData, {
      level: LEVEL_CODE[a.level], reason_code: a.reasonCode, public_note: a.publicNote, raised_at: BigInt(a.raisedAt),
    });
    const existing = await fetchMaybeAttestation(this.rpc, attestation);
    const payer = this.sender.payer;
    // A2: replacing is close + create in one transaction.
    const ixs = [
      ...(existing.exists ? [getCloseAttestationInstruction({ payer, authority: this.platform, credential, attestation })] : []),
      getCreateAttestationInstruction({ payer, authority: this.platform, credential, schema, attestation, nonce, data, expiry: 0n }),
    ];
    return this.sender.send(ixs);
  }

  async clear(batchKey: BatchKey): Promise<TxRef> {
    const { credential, attestation } = await this.context(batchKey);
    return this.sender.send([getCloseAttestationInstruction({ payer: this.sender.payer, authority: this.platform, credential, attestation })]);
  }

  async find(batchKey: BatchKey): Promise<BatchAlert | null> {
    const { schema, attestation } = await this.context(batchKey);
    const acc = await fetchMaybeAttestation(this.rpc, attestation as Address);
    if (!acc.exists || acc.data.signer !== this.platform.address || !isLive(acc.data.expiry, this.clock.now())) return null;
    const schemaData = (await fetchSchema(this.rpc, schema)).data;
    const d = deserializeAttestationData(schemaData, Uint8Array.from(acc.data.data)) as unknown as Decoded;
    const level = LEVEL_BY_CODE[Number(d.level)];
    if (!level) return null;
    return {
      batchKey, level, reasonCode: d.reason_code, publicNote: d.public_note,
      raisedBy: asWallet(acc.data.signer) as WalletAddress, raisedAt: Number(d.raised_at),
    };
  }
}
