import {
  appendTransactionMessageInstructions, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, getSignatureFromTransaction,
  pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, type Instruction, type KeyPairSigner,
} from "@solana/kit";
import type { TxRef } from "@certapharm/application";

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export interface SolanaConnection {
  readonly rpc: SolanaRpc;
  readonly cluster: string;
  explorerUrl(signature: string): string;
}

export function makeConnection(rpcUrl: string, cluster = "devnet"): SolanaConnection {
  return {
    rpc: createSolanaRpc(rpcUrl),
    cluster,
    explorerUrl: (sig) => `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`,
  };
}

/** Builds, signs, sends and confirms a transaction. The fee payer (the platform) sponsors every fee, so actors need no SOL. */
export class TxSender {
  private readonly confirm;
  constructor(
    private readonly conn: SolanaConnection,
    private readonly feePayer: KeyPairSigner,
    rpcUrl: string,
  ) {
    const subs = createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, "ws"));
    this.confirm = sendAndConfirmTransactionFactory({ rpc: conn.rpc as never, rpcSubscriptions: subs as never });
  }

  get payer(): KeyPairSigner {
    return this.feePayer;
  }

  /** Signers embedded in the instruction accounts sign alongside the fee payer. */
  async send(ixs: Instruction[]): Promise<TxRef> {
    const { value: blockhash } = await this.conn.rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(this.feePayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m),
    );
    const tx = await signTransactionMessageWithSigners(message);
    await this.confirm(tx as never, { commitment: "confirmed" });
    const signature = getSignatureFromTransaction(tx);
    return { signature, explorerUrl: this.conn.explorerUrl(signature) };
  }
}
