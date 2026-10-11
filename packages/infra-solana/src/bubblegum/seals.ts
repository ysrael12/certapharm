import { createSignerFromKeypair, generateSigner, publicKey, signerIdentity, type Signer, type Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createTreeV2, findLeafAssetIdPda, mintV2, mplBubblegum, parseLeafFromMintV2Transaction } from "@metaplex-foundation/mpl-bubblegum";
import { dasApi, type DasApiInterface } from "@metaplex-foundation/digital-asset-standard-api";
import type { SealFound, SealMinter, SealReader, SignerRef, TxRef } from "@certapharm/application";
import type { BatchKey, Gtin, LotNumber, SerialNumber, WalletAddress } from "@certapharm/domain";
import type { SealTreeRegistry } from "./trees.js";

/** 16,384 units per issuer tree (spec 02 section 5). */
const TREE = { maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 } as const;
const INDEX_TTL_MS = 15_000;
const PAGE = 1000;

type DasUmi = Umi & { rpc: Umi["rpc"] & DasApiInterface };

export interface BubblegumSealsConfig {
  readonly rpcUrl: string;
  readonly publicBaseUrl: string;
  readonly explorerTx: (signature: string) => string;
  readonly trees: SealTreeRegistry;
  /** Secret key bytes of a wallet the process may sign with (an issuer, or the platform). */
  readonly secretOf: (address: string) => Uint8Array;
  /** Pays tree rent and transaction fees, so issuers need no SOL. */
  readonly payer: string;
}

/** BC4 on Bubblegum V2: one compressed NFT per unit, minted by the issuer into the issuer's own Merkle tree. */
export class BubblegumSeals implements SealMinter, SealReader {
  private readonly umi: DasUmi;
  private readonly index = new Map<string, { at: number; byName: Map<string, string> }>();

  constructor(private readonly cfg: BubblegumSealsConfig) {
    this.umi = createUmi(cfg.rpcUrl).use(mplBubblegum()).use(dasApi()) as DasUmi;
  }

  private signer(address: string): Signer {
    return createSignerFromKeypair(this.umi, this.umi.eddsa.createKeypairFromSecretKey(this.cfg.secretOf(address)));
  }

  /** A Umi whose default identity is the payer; the issuer is passed explicitly where its signature is required. */
  private withPayer(): { umi: DasUmi; payer: Signer } {
    const payer = this.signer(this.cfg.payer);
    const umi = createUmi(this.cfg.rpcUrl).use(mplBubblegum()).use(dasApi()).use(signerIdentity(payer)) as DasUmi;
    return { umi, payer };
  }

  async ensureTree(issuer: SignerRef): Promise<{ tree: string; created: boolean }> {
    const known = this.cfg.trees.get(issuer.address);
    if (known) return { tree: known, created: false };
    const { umi, payer } = this.withPayer();
    const merkleTree = generateSigner(umi);
    const creator = this.signer(issuer.address);
    await (await createTreeV2(umi, { merkleTree, treeCreator: creator, payer, ...TREE })).sendAndConfirm(umi);
    this.cfg.trees.set(issuer.address, merkleTree.publicKey);
    return { tree: merkleTree.publicKey, created: true };
  }

  async seal(issuer: SignerRef, u: { batchKey: BatchKey; gtin: Gtin; lot: LotNumber; serial: SerialNumber }): Promise<TxRef & { assetId: string; leafIndex: number }> {
    const tree = this.cfg.trees.get(issuer.address);
    if (!tree) throw new Error(`No seal tree for ${issuer.address}. Create it first.`);
    const name = sealName(u.lot, u.serial);
    const { umi, payer } = this.withPayer();
    const owner = this.signer(issuer.address);
    const uri = `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/api/seal/${u.gtin}/${encodeURIComponent(u.lot)}/${encodeURIComponent(u.serial)}.json`;
    const sent = await mintV2(umi, {
      payer,
      leafOwner: publicKey(issuer.address),
      merkleTree: publicKey(tree),
      treeCreatorOrDelegate: owner,
      metadata: { name, symbol: "CPH", uri, sellerFeeBasisPoints: 0, collection: null as never, creators: [] },
    }).sendAndConfirm(umi);
    const signature = base58.deserialize(sent.signature)[0];

    let leaf: Awaited<ReturnType<typeof parseLeafFromMintV2Transaction>> | undefined;
    for (let i = 0; i < 10 && !leaf; i++) {
      try { leaf = await parseLeafFromMintV2Transaction(umi, sent.signature); } catch { await new Promise((r) => setTimeout(r, 1500)); }
    }
    if (!leaf) throw new Error(`Seal minted (${signature}) but its leaf could not be read yet`);
    const [assetId] = findLeafAssetIdPda(umi, { merkleTree: publicKey(tree), leafIndex: leaf.nonce });
    this.index.delete(issuer.address);
    return { signature, explorerUrl: this.cfg.explorerTx(signature), assetId, leafIndex: Number(leaf.nonce) };
  }

  /** Every unit sealed into the issuer's tree, by name. Cached for 15 s. Burnt assets and assets from other trees are ignored. */
  private async byName(issuer: string): Promise<Map<string, string>> {
    const hit = this.index.get(issuer);
    if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.byName;
    const tree = this.cfg.trees.get(issuer);
    const byName = new Map<string, string>();
    if (tree) {
      for (let page = 1; ; page++) {
        const res = await this.umi.rpc.getAssetsByOwner({ owner: publicKey(issuer), limit: PAGE, page });
        for (const a of res.items) {
          if (a.burnt || !a.compression.compressed || a.compression.tree !== tree) continue;
          byName.set(a.content.metadata.name, a.id);
        }
        if (res.items.length < PAGE) break;
      }
    }
    this.index.set(issuer, { at: Date.now(), byName });
    return byName;
  }

  async find(issuer: WalletAddress, u: { gtin: Gtin; lot: LotNumber; serial: SerialNumber }): Promise<SealFound> {
    const id = (await this.byName(issuer)).get(sealName(u.lot, u.serial));
    return id ? { status: "SEALED", assetId: id } : { status: "NOT_FOUND" };
  }
}

/** `CPH {lot}-{serial}`; the metadata name is capped at 32 bytes (spec 02 section 5). */
export function sealName(lot: string, serial: string): string {
  const name = `CPH ${lot}-${serial}`;
  if (new TextEncoder().encode(name).length > 32) throw new Error(`Seal name "${name}" is longer than 32 bytes. Use a shorter lot or serial.`);
  return name;
}
