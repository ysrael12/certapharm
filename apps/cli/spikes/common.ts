import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes, generateKeyPairSigner,
  sendAndConfirmTransactionFactory, pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners, getSignatureFromTransaction, lamports,
  type Instruction, type KeyPairSigner,
} from "@solana/kit";

const ROOT = resolve(import.meta.dirname, "../../..");
for (const l of readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]!] ??= m[2]!;
}
export const RPC_URL = process.env.RPC_URL!;
export const rpc = createSolanaRpc(RPC_URL);
const wss = RPC_URL.replace("https://", "wss://");
export const rpcSubs = createSolanaRpcSubscriptions(wss);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: rpcSubs });

export async function loadKey(name: string): Promise<KeyPairSigner> {
  const dir = resolve(ROOT, ".keys"); mkdirSync(dir, { recursive: true });
  const f = resolve(dir, `${name}.json`);
  if (existsSync(f)) return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(f, "utf8"))));
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const bytes = new Uint8Array(64); bytes.set(pkcs8.slice(-32), 0); bytes.set(raw, 32);
  writeFileSync(f, JSON.stringify([...bytes]));
  return createKeyPairSignerFromBytes(bytes);
}

export async function ensureFunds(s: KeyPairSigner, minSol = 1) {
  const bal = async () => Number((await rpc.getBalance(s.address).send()).value) / 1e9;
  if ((await bal()) >= minSol) return;
  for (let i = 0; i < 3 && (await bal()) < minSol; i++) {
    try {
      const sig = await rpc.requestAirdrop(s.address, lamports(2_000_000_000n)).send();
      for (let k = 0; k < 20; k++) { await new Promise(r => setTimeout(r, 1500)); if ((await bal()) >= minSol) break; }
      console.log("airdrop", s.address, sig);
    } catch (e) { console.log("airdrop failed:", (e as Error).message); await new Promise(r => setTimeout(r, 3000)); }
  }
  console.log("balance", s.address, await bal());
}

export async function send(payer: KeyPairSigner, ixs: Instruction[]): Promise<string> {
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const msg = pipe(createTransactionMessage({ version: 0 }),
    m => setTransactionMessageFeePayerSigner(payer, m),
    m => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    m => appendTransactionMessageInstructions(ixs, m));
  const tx = await signTransactionMessageWithSigners(msg);
  await sendAndConfirm(tx as never, { commitment: "confirmed" });
  return getSignatureFromTransaction(tx);
}
export { generateKeyPairSigner };
