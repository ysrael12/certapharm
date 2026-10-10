import type { KeyPairSigner } from "@solana/kit";
import {
  deriveCredentialPda, deriveSchemaPda, getCreateCredentialInstruction, getCreateSchemaInstruction,
} from "sas-lib";
import type { PlatformAddresses, PlatformSetup } from "@certapharm/application";
import type { SolanaRpc, TxSender } from "../rpc.js";
import { LAYOUT, PLATFORM_CREDENTIAL_NAME, SCHEMA_VERSION, accountExists } from "./common.js";

export async function derivePlatformAddresses(authority: KeyPairSigner["address"]): Promise<PlatformAddresses> {
  const [credential] = await deriveCredentialPda({ authority, name: PLATFORM_CREDENTIAL_NAME });
  const [participant] = await deriveSchemaPda({ credential, name: "participant", version: SCHEMA_VERSION });
  const [alert] = await deriveSchemaPda({ credential, name: "batch-alert", version: SCHEMA_VERSION });
  return { platformCredential: credential, participantSchema: participant, alertSchema: alert };
}

export class SasPlatformSetup implements PlatformSetup {
  constructor(
    private readonly rpc: SolanaRpc,
    private readonly sender: TxSender,
    private readonly platform: KeyPairSigner,
  ) {}

  async ensure() {
    const addr = await derivePlatformAddresses(this.platform.address);
    const payer = this.sender.payer;
    const signatures: string[] = [];
    const credential = addr.platformCredential as KeyPairSigner["address"];

    if (!(await accountExists(this.rpc, credential))) {
      const tx = await this.sender.send([getCreateCredentialInstruction({
        payer, credential, authority: this.platform, name: PLATFORM_CREDENTIAL_NAME, signers: [this.platform.address],
      })]);
      signatures.push(tx.signature);
    }
    const schemas = [
      { pda: addr.participantSchema, name: "participant", description: "Certapharm accredited participant",
        layout: [LAYOUT.U8, LAYOUT.STRING, LAYOUT.STRING], fieldNames: ["role", "display_name", "legal_id_hash"] },
      { pda: addr.alertSchema, name: "batch-alert", description: "Certapharm batch alert",
        layout: [LAYOUT.U8, LAYOUT.STRING, LAYOUT.STRING, LAYOUT.I64], fieldNames: ["level", "reason_code", "public_note", "raised_at"] },
    ];
    for (const s of schemas) {
      if (await accountExists(this.rpc, s.pda as KeyPairSigner["address"])) continue;
      const tx = await this.sender.send([getCreateSchemaInstruction({
        payer, authority: this.platform, credential, schema: s.pda as KeyPairSigner["address"], name: s.name,
        description: s.description, layout: new Uint8Array(s.layout), fieldNames: s.fieldNames,
      })]);
      signatures.push(tx.signature);
    }
    return { ...addr, signatures };
  }
}
