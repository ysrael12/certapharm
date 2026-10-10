import { Command } from "commander";
import type { Result } from "@certapharm/domain";
import { resolve } from "node:path";
import { loadOrCreateKeyFile } from "@certapharm/infra-solana";
import { KEYS_DIR, buildContainer, type Container } from "./container.js";

const program = new Command().name("cph").description("Certapharm operator CLI (devnet)");

function fail(e: { code: string; message: string; kind?: string }): never {
  console.error(`error [${e.code}] ${e.message}`);
  process.exit(1);
}
function unwrap<T>(r: Result<T, { code: string; message: string }>): T {
  return r.ok ? r.value : fail(r.error);
}

/** Builds the container once, prints one line per domain event, and runs the command. */
function command(name: string, description: string, configure: (c: Command) => Command, run: (c: Container, opts: Record<string, string>) => Promise<void>) {
  configure(program.command(name).description(description)).action(async (opts: Record<string, string>) => {
    try {
      const c = await buildContainer();
      c.bus.subscribe("ParticipantAccredited", (e) => console.log(`  tx ${e.explorerUrl}`));
      c.bus.subscribe("BatchCertified", (e) => console.log(`  tx ${e.explorerUrl}`));
      c.bus.subscribe("CustodyEventRecorded", (e) => console.log(`  tx ${e.explorerUrl}`));
      await run(c, opts);
    } catch (e) {
      fail({ code: "CLI_FAILURE", message: e instanceof Error ? e.message : String(e) });
    }
  });
}

program.command("keys:new <name>").description("Create .keys/<name>.json (never committed) and print its address").action(async (name: string) => {
  console.log(`${name}: ${(await loadOrCreateKeyFile(resolve(KEYS_DIR, `${name}.json`))).address}`);
});

command("platform:init", "UC1 create the Platform credential and schemas (idempotent)", (c) => c, async (c) => {
  const out = unwrap(await c.bootstrapPlatform.execute());
  console.log(JSON.stringify(out, null, 2));
  console.log(out.signatures.length === 0 ? "nothing to do" : `${out.signatures.length} transaction(s) sent`);
});

command("participant:accredit", "UC2 accredit a wallet (Platform Authority)", (c) => c
  .requiredOption("--wallet <nameOrAddress>", "key name in .keys/ or a base58 address")
  .requiredOption("--role <role>", "MANUFACTURER|IMPORTER|DISTRIBUTOR|CARRIER|PHARMACY")
  .requiredOption("--name <displayName>", "public display name")
  .requiredOption("--cnpj <cnpj>", "CNPJ; only its SHA-256 is stored"), async (c, o) => {
  const wallet = await c.resolveWallet(o.wallet!);
  const { participant } = unwrap(await c.accreditParticipant.execute({
    by: c.authority, wallet, role: o.role!, displayName: o.name!, cnpj: o.cnpj!,
  }));
  console.log(`accredited ${participant.displayName} (${participant.role}) ${participant.wallet}`);
});

command("issuer:onboard", "UC3 create the issuer credential and batch schema", (c) => c
  .requiredOption("--as <key>", "issuer key name in .keys/"), async (c, o) => {
  const out = unwrap(await c.onboardIssuer.execute({ issuer: await c.signerRef(o.as!) }));
  console.log(JSON.stringify(out, null, 2));
});

command("batch:register", "UC4 certify a batch", (c) => c
  .requiredOption("--as <key>", "issuer key name in .keys/")
  .requiredOption("--gtin <gtin>").requiredOption("--lot <lot>")
  .requiredOption("--expiry <date>", "YYMMDD or YYYY-MM-DD")
  .requiredOption("--product <name>").requiredOption("--dosage <dosage>")
  .option("--country <iso2>", "country of manufacture", "BR"), async (c, o) => {
  const { batch, verifyUrl } = unwrap(await c.registerBatch.execute({
    issuer: await c.signerRef(o.as!), gtin: o.gtin!, lot: o.lot!, expiry: o.expiry!,
    productName: o.product!, dosage: o.dosage!, country: o.country!,
  }));
  console.log(`certified ${batch.gtin} lot ${batch.lot}\n  batchKey ${batch.key}\n  attestation ${batch.certificate}\n  verify ${verifyUrl}`);
});

command("custody:record", "UC5 record a custody event", (c) => c
  .requiredOption("--as <key>", "actor key name in .keys/")
  .requiredOption("--gtin <gtin>").requiredOption("--lot <lot>")
  .requiredOption("--type <type>", "SHIPPED|RECEIVED|STORED|DISPENSED")
  .option("--temp <celsius>", "temperature in °C").option("--site <siteId>", "site id; only a short hash is stored"), async (c, o) => {
  const temperatureC = o.temp === undefined ? undefined : Number(o.temp);
  if (temperatureC !== undefined && Number.isNaN(temperatureC)) fail({ code: "TEMPERATURE_OUT_OF_RANGE", message: "--temp must be a number" });
  unwrap(await c.recordCustodyEvent.execute({
    actor: await c.signerRef(o.as!), gtin: o.gtin!, lot: o.lot!, type: o.type!,
    ...(temperatureC !== undefined ? { temperatureC } : {}), ...(o.site ? { siteId: o.site } : {}),
  }));
  console.log(`recorded ${o.type} for ${o.gtin} lot ${o.lot}`);
});

await program.parseAsync();
