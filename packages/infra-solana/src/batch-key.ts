import { getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS } from "sas-lib";
import type { BatchKeyDeriver } from "@certapharm/application";
import type { BatchKey, Gtin, LotNumber } from "@certapharm/domain";

/** Spec 02 §2. The SAS program id is only a namespace; no account ever exists at the BatchKey. */
export class KitBatchKeyDeriver implements BatchKeyDeriver {
  async derive(gtin: Gtin, lot: LotNumber): Promise<BatchKey> {
    const utf8 = getUtf8Encoder();
    const [key] = await getProgramDerivedAddress({
      programAddress: SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
      seeds: [utf8.encode("certapharm:batch:v1"), utf8.encode(gtin), utf8.encode(lot)],
    });
    return key as string as BatchKey;
  }
}
