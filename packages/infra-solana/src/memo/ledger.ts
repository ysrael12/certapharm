import { AccountRole, address, getBase58Encoder, getUtf8Decoder, getUtf8Encoder, type Address, type Instruction, type Signature } from "@solana/kit";
import type { CustodyLedger, RawCustodyEvent, SignerRef, TxRef } from "@certapharm/application";
import { CUSTODY_EVENT_TYPES, type BatchKey, type Clock, type CustodyEventType, type WalletAddress } from "@certapharm/domain";
import type { Keyring } from "../keys.js";
import type { SolanaRpc, TxSender } from "../rpc.js";

export const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const MEMO_PREFIX = "cph1 ";
const MAX_MEMO_BYTES = 400;
const TRAIL_LIMIT = 100;

/** System transfer of 0 lamports from `payer` to itself, with the BatchKey as an extra read-only account (Solana Pay "reference"). */
function referenceIx(payer: { address: Address }, signer: unknown, batchKey: Address): Instruction {
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer } as never,
      { address: payer.address, role: AccountRole.WRITABLE },
      { address: batchKey, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  };
}

export function encodeMemo(e: { batchKey: string; gtin: string; lot: string; type: string; temperatureC?: number; locationHash?: string }): string {
  const body = {
    t: e.type, b: e.batchKey, g: e.gtin, l: e.lot,
    ...(e.temperatureC !== undefined ? { tc: Math.round(e.temperatureC * 10) / 10 } : {}),
    ...(e.locationHash ? { loc: e.locationHash } : {}),
  };
  const text = `${MEMO_PREFIX}${JSON.stringify(body)}`;
  if (getUtf8Encoder().encode(text).length > MAX_MEMO_BYTES) throw new Error("Custody memo exceeds 400 bytes");
  return text;
}

/** Parses a `cph1 {...}` memo. Returns null for anything that is not a well-formed Certapharm entry for this BatchKey. */
export function decodeMemo(text: string, batchKey: string):
  | { type: CustodyEventType; temperatureC?: number; locationHash?: string } | null {
  if (!text.startsWith(MEMO_PREFIX)) return null;
  let body: Record<string, unknown>;
  try { body = JSON.parse(text.slice(MEMO_PREFIX.length)) as Record<string, unknown>; } catch { return null; }
  if (body.b !== batchKey) return null;
  if (!(CUSTODY_EVENT_TYPES as readonly unknown[]).includes(body.t)) return null;
  return {
    type: body.t as CustodyEventType,
    ...(typeof body.tc === "number" ? { temperatureC: body.tc } : {}),
    ...(typeof body.loc === "string" && /^[0-9a-f]{8}$/.test(body.loc) ? { locationHash: body.loc } : {}),
  };
}

interface RawTx {
  blockTime: bigint | null;
  transaction: {
    message: {
      accountKeys: string[];
      header: { numRequiredSignatures: number };
      instructions: Array<{ programIdIndex: number; accounts: number[]; data: string }>;
    };
  };
}

/** Custody events are Memo instructions signed by the actor, indexed by a reference account (the BatchKey). */
export class MemoCustodyLedger implements CustodyLedger {
  constructor(
    private readonly rpc: SolanaRpc,
    private readonly sender: TxSender,
    private readonly keyring: Keyring,
    private readonly clock: Clock,
  ) {}

  async record(actor: SignerRef, e: Parameters<CustodyLedger["record"]>[1]): Promise<TxRef> {
    const signer = this.keyring.get(actor.address);
    const text = encodeMemo(e);
    const memoIx: Instruction = {
      programAddress: MEMO_PROGRAM,
      accounts: [{ address: signer.address, role: AccountRole.READONLY_SIGNER, signer } as never],
      data: getUtf8Encoder().encode(text),
    };
    // The platform pays and signs the reference transfer, so the actor needs no SOL.
    const payer = this.sender.payer;
    return this.sender.send([referenceIx(payer, payer, e.batchKey as string as Address), memoIx]);
  }

  async readTrail(batchKey: BatchKey): Promise<RawCustodyEvent[]> {
    const sigs = await this.rpc.getSignaturesForAddress(batchKey as string as Address, { limit: TRAIL_LIMIT }).send();
    const ok = sigs.filter((s) => s.err === null);
    const txs = await Promise.all(ok.map((s) =>
      this.rpc.getTransaction(s.signature as Signature, { encoding: "json", maxSupportedTransactionVersion: 0 }).send()));
    const b58 = getBase58Encoder();
    const utf8 = getUtf8Decoder();
    const events: RawCustodyEvent[] = [];
    for (const [i, tx] of txs.entries()) {
      const sig = ok[i];
      if (!tx || !sig) continue;
      const { message } = (tx as unknown as RawTx).transaction;
      for (const ix of message.instructions) {
        if (message.accountKeys[ix.programIdIndex] !== MEMO_PROGRAM) continue;
        const decoded = decodeMemo(utf8.decode(b58.encode(ix.data)), batchKey);
        const signerIndex = ix.accounts[0];
        // The actor is the memo's signer, and it must really be a transaction signer.
        if (!decoded || signerIndex === undefined || signerIndex >= message.header.numRequiredSignatures) continue;
        const actor = message.accountKeys[signerIndex];
        if (!actor) continue;
        const time = (tx as unknown as RawTx).blockTime ?? sig.blockTime;
        events.push({
          signature: sig.signature, actor: actor as WalletAddress, occurredAt: time === null ? this.clock.now() : Number(time), ...decoded,
        });
      }
    }
    return events;
  }
}
