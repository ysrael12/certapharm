import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, signerIdentity, generateSigner } from "@metaplex-foundation/umi";
import { mplBubblegum, createTreeV2, mintV2, parseLeafFromMintV2Transaction, findLeafAssetIdPda } from "@metaplex-foundation/mpl-bubblegum";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "./common.js";

const bytes = Uint8Array.from(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../.keys/platform.json"), "utf8")));
const umi = createUmi(process.env.RPC_URL!).use(mplBubblegum()).use(dasApi());
const kp = umi.eddsa.createKeypairFromSecretKey(bytes);
umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));

const merkleTree = generateSigner(umi);
const tb = await createTreeV2(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 });
const r1 = await tb.sendAndConfirm(umi);
console.log("tree", merkleTree.publicKey, "tx", base58.deserialize(r1.signature)[0]);

const r2 = await mintV2(umi, {
  leafOwner: umi.identity.publicKey, merkleTree: merkleTree.publicKey,
  metadata: { name: "CPH L2026A-0001", uri: "https://certapharm.vercel.app/api/seal/02001234567893/L2026A/0001.json",
    sellerFeeBasisPoints: 0, collection: null as never, creators: [] },
}).sendAndConfirm(umi);
const mintSig = base58.deserialize(r2.signature)[0];
console.log("mint tx", mintSig);
let leaf; for (let i = 0; i < 10 && !leaf; i++) { try { leaf = await parseLeafFromMintV2Transaction(umi, r2.signature); } catch { await new Promise(r => setTimeout(r, 2000)); } }
const [assetId] = findLeafAssetIdPda(umi, { merkleTree: merkleTree.publicKey, leafIndex: leaf!.nonce });
console.log("leafIndex", leaf!.nonce, "assetId", assetId);
let asset; for (let i = 0; i < 15 && !asset; i++) { try { asset = await umi.rpc.getAsset(assetId); } catch { await new Promise(r => setTimeout(r, 2000)); } }
console.log("DAS getAsset: compressed =", asset?.compression.compressed, "burnt =", asset?.burnt, "name =", asset?.content.metadata.name);
