import { address, AccountRole, getProgramDerivedAddress, getUtf8Encoder, type Instruction } from "@solana/kit";
import { SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS } from "sas-lib";
import { loadKey, send, rpc } from "./common.js";

const actor = await loadKey("platform");
const u = getUtf8Encoder();
const [batchKey] = await getProgramDerivedAddress({
  programAddress: SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  seeds: [u.encode("certapharm:batch:v1"), u.encode("02001234567893"), u.encode("L2026A")],
});
const refIx: Instruction = {
  programAddress: address("11111111111111111111111111111111"),
  accounts: [
    { address: actor.address, role: AccountRole.WRITABLE_SIGNER, signer: actor } as never,
    { address: actor.address, role: AccountRole.WRITABLE },
    { address: batchKey, role: AccountRole.READONLY },
  ],
  data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // transfer, 0 lamports
};
const text = `cph1 ${JSON.stringify({ t: "RECEIVED", b: batchKey, g: "02001234567893", l: "L2026A", tc: 4.5 })}`;
const memoIx: Instruction = {
  programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
  accounts: [{ address: actor.address, role: AccountRole.READONLY_SIGNER, signer: actor } as never],
  data: u.encode(text),
};
const sig = await send(actor, [refIx, memoIx]);
console.log("tx", sig, "batchKey", batchKey);
let found: string[] = [];
for (let i = 0; i < 10 && !found.includes(sig); i++) {
  await new Promise(r => setTimeout(r, 1500));
  found = (await rpc.getSignaturesForAddress(batchKey, { limit: 100 }).send()).map(s => s.signature);
}
console.log("getSignaturesForAddress(batchKey) contains tx:", found.includes(sig));
const tx = await rpc.getTransaction(sig as never, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }).send();
console.log(tx?.meta?.logMessages?.filter(l => l.includes("Memo")));
