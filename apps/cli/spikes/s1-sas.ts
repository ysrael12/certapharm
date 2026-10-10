import { getBase58Decoder, type Address } from "@solana/kit";
import {
  deriveCredentialPda, deriveSchemaPda, deriveAttestationPda, getCreateCredentialInstruction,
  getCreateSchemaInstruction, getCreateAttestationInstruction, fetchSchema, fetchMaybeAttestation,
  serializeAttestationData, deserializeAttestationData, SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
} from "sas-lib";
import { loadKey, ensureFunds, send, rpc } from "./common.js";

const platform = await loadKey("platform");
await ensureFunds(platform, 1);
const wallet = await loadKey("demo-participant");

const [credential] = await deriveCredentialPda({ authority: platform.address, name: "certapharm" });
const [schemaPda] = await deriveSchemaPda({ credential, name: "participant", version: 1 });
const [att] = await deriveAttestationPda({ credential, schema: schemaPda, nonce: wallet.address });
console.log({ credential, schemaPda, att });

const exists = async (a: Address) => (await rpc.getAccountInfo(a, { encoding: "base64" }).send()).value !== null;
const sigs: Record<string, string> = {};
if (!(await exists(credential))) {
  sigs.credential = await send(platform, [getCreateCredentialInstruction({
    payer: platform, credential, authority: platform, name: "certapharm", signers: [platform.address] })]);
  console.log("credential", sigs.credential);
}
if (!(await exists(schemaPda))) {
  sigs.schema = await send(platform, [getCreateSchemaInstruction({
    payer: platform, authority: platform, credential, schema: schemaPda, name: "participant",
    description: "Certapharm accredited participant", layout: new Uint8Array([0, 12, 12]),
    fieldNames: ["role", "display_name", "legal_id_hash"] })]);
  console.log("schema", sigs.schema);
}
const schema = await fetchSchema(rpc, schemaPda);
console.log("schema.version =", schema.data.version);
const data = serializeAttestationData(schema.data, { role: 1, display_name: "Laboratorio Demo", legal_id_hash: "ab".repeat(32) });
sigs.attestation = await send(platform, [getCreateAttestationInstruction({
  payer: platform, authority: platform, credential, schema: schemaPda, attestation: att,
  nonce: wallet.address, data, expiry: BigInt(Math.floor(Date.now() / 1000) + 365 * 86400) })]);
console.log("attestation", sigs.attestation);

const maybe = await fetchMaybeAttestation(rpc, att);
if (!maybe.exists) throw new Error("attestation not found");
console.log("decoded", deserializeAttestationData(schema.data, Uint8Array.from(maybe.data.data)));

// memcmp offset check: find the schema address inside the raw account
const info = await rpc.getAccountInfo(att, { encoding: "base64" }).send();
const raw = Buffer.from(info.value!.data[0], "base64");
const dec = getBase58Decoder();
for (const off of [1, 33, 65, 97]) console.log("offset", off, dec.decode(raw.subarray(off, off + 32)) === schemaPda ? "== schema" : "");
const found = await rpc.getProgramAccounts(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS, {
  encoding: "base64", filters: [{ memcmp: { offset: 65n, bytes: schemaPda as never, encoding: "base58" } }] }).send();
console.log("memcmp@65 hits:", found.length, found.map(f => f.pubkey));
console.log("SIGS", JSON.stringify(sigs));
