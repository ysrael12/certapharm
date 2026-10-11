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
function command(name: string, description: string, configure: (c: Command) => Command, run: (c: Container, opts: Record<string, string>, arg: string) => Promise<void>) {
  configure(program.command(name).description(description)).action(async (...args: unknown[]) => {
    // commander passes positional arguments first, then options, then the Command itself
    const opts = (args.find((a) => typeof a === "object" && a !== null && !(a instanceof Command)) ?? {}) as Record<string, string>;
    const arg = typeof args[0] === "string" ? args[0] : "";
    try {
      const c = await buildContainer();
      c.bus.subscribe("ParticipantAccredited", (e) => console.log(`  tx ${e.explorerUrl}`));
      c.bus.subscribe("BatchCertified", (e) => console.log(`  tx ${e.explorerUrl}`));
      c.bus.subscribe("CustodyEventRecorded", (e) => console.log(`  tx ${e.explorerUrl}`));
      await run(c, opts, arg);
      // The seal adapter (Umi) keeps sockets open, so end the process once the command is done.
      process.exit(process.exitCode ?? 0);
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

function printReport(link: string, r: import("@certapharm/domain").VerificationReport): void {
  console.log(`${r.verdict}  ${link}`);
  if (r.batch) console.log(`  ${r.batch.productName} ${r.batch.dosage} · issuer ${r.batch.issuer.displayName ?? r.batch.issuer.wallet}`);
  for (const f of r.findings) console.log(`  [${f.severity}] ${f.code}: ${f.message}`);
  if (r.alert) console.log(`  alert ${r.alert.level} ${r.alert.reasonCode}: ${r.alert.publicNote}`);
  if (r.unit) console.log(`  unit ${r.unit.serial}: seal ${r.unit.seal}${r.unit.assetId ? ` (asset ${r.unit.assetId})` : ""}`);
  for (const e of r.trail) console.log(`  ${new Date(e.occurredAt * 1000).toISOString()} ${e.type.padEnd(9)} ${e.actorName ?? e.actor} (${e.actorRole})${e.temperatureC !== undefined ? ` ${e.temperatureC} °C` : ""}`);
}

command("verify <link>", "UC6 verify a GS1 Digital Link (public, read-only)", (c) => c, async (c, _o, link) => {
  const started = Date.now();
  const report = unwrap(await c.verifyProduct.execute({ link }));
  printReport(link, report);
  console.log(`  (${Date.now() - started} ms)`);
});

/** `0001-0010` (keeps the zero padding) or `A1,B2,C3`. */
function parseSerials(spec: string): string[] {
  const range = /^(\D*)(\d+)-(\1)?(\d+)$/.exec(spec.trim());
  if (!range) return spec.split(",").map((s) => s.trim()).filter(Boolean);
  const [, prefix = "", from = "", , to = ""] = range;
  const width = from.length;
  const out: string[] = [];
  for (let n = Number(from); n <= Number(to); n++) out.push(`${prefix}${String(n).padStart(width, "0")}`);
  return out;
}

command("units:init", "UC7 create the issuer's seal tree (once per issuer)", (c) => c
  .requiredOption("--as <key>", "issuer key name in .keys/"), async (c, o) => {
  const { tree, created } = await c.sealMinter.ensureTree(await c.signerRef(o.as!));
  console.log(`${created ? "created" : "already exists"} seal tree ${tree}\n  saved in config/seal-trees.json (commit it: tree addresses are public)`);
});

command("units:seal", "UC7 seal the units of a certified batch (up to 50 per call)", (c) => c
  .requiredOption("--as <key>", "issuer key name in .keys/")
  .requiredOption("--gtin <gtin>").requiredOption("--lot <lot>")
  .requiredOption("--serials <spec>", "0001-0010 or A1,B2,C3"), async (c, o) => {
  const r = unwrap(await c.sealUnits.execute({ issuer: await c.signerRef(o.as!), gtin: o.gtin!, lot: o.lot!, serials: parseSerials(o.serials!) }));
  for (const u of r.sealed) console.log(`  sealed ${u.serial}  asset ${u.assetId}\n    tx ${u.explorerUrl}`);
  if (r.skipped.length) console.log(`  already sealed: ${r.skipped.join(", ")}`);
  for (const f of r.failed) console.error(`  failed ${f.serial}: [${f.code}] ${f.message}`);
  console.log(`${r.sealed.length} sealed, ${r.skipped.length} skipped, ${r.failed.length} failed (tree ${r.tree})`);
  if (r.failed.length) process.exitCode = 1;
});

command("alert:raise", "UC8 raise or replace a batch alert (Platform Authority)", (c) => c
  .requiredOption("--gtin <gtin>").requiredOption("--lot <lot>")
  .requiredOption("--level <level>", "RECALL|SUSPECTED_COUNTERFEIT|COLD_CHAIN_BREACH|REGULATOR_NOTICE")
  .requiredOption("--reason <code>", "short reason code").requiredOption("--note <text>", "public note, at most 140 bytes"), async (c, o) => {
  const { tx } = unwrap(await c.raiseAlert.raise({ by: c.authority, gtin: o.gtin!, lot: o.lot!, level: o.level!, reasonCode: o.reason!, publicNote: o.note! }));
  console.log(`alert ${o.level} raised for ${o.gtin} lot ${o.lot}\n  tx ${tx.explorerUrl}`);
});

command("alert:clear", "UC8 clear a batch alert (Platform Authority)", (c) => c
  .requiredOption("--gtin <gtin>").requiredOption("--lot <lot>"), async (c, o) => {
  const { tx } = unwrap(await c.raiseAlert.clear({ by: c.authority, gtin: o.gtin!, lot: o.lot! }));
  console.log(`alert cleared for ${o.gtin} lot ${o.lot}\n  tx ${tx.explorerUrl}`);
});

const GTIN = "2001234567893";
const EXPIRY = "2027-12-31";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

command("demo:seed", "UC10 build the demo world: batch A authentic, B recalled, C unknown (idempotent)", (c) => c
  .option("--lots <a,b,c>", "lot numbers for batches A, B and C (C is never registered)", "L2026A,L2026B,L2026X"), async (c, o) => {
  const [lotA, lotB, lotC] = (o.lots ?? "").split(",").map((s) => s.trim());
  if (!lotA || !lotB || !lotC) fail({ code: "LOTS_INVALID", message: "--lots needs three comma-separated lot numbers" });
  const people = [
    { key: "labX", role: "MANUFACTURER", name: "Laboratório Demo", cnpj: "11111111000191" },
    { key: "distY", role: "DISTRIBUTOR", name: "Distribuidora Demo", cnpj: "22222222000172" },
    { key: "carrierZ", role: "CARRIER", name: "Transportadora Demo", cnpj: "33333333000153" },
    { key: "pharmaW", role: "PHARMACY", name: "Farmácia Demo", cnpj: "44444444000134" },
  ];
  console.log(unwrap(await c.bootstrapPlatform.execute()).signatures.length === 0 ? "platform ready" : "platform created");
  for (const p of people) {
    const wallet = await c.resolveWallet(p.key);
    const r = await c.accreditParticipant.execute({ by: c.authority, wallet, role: p.role, displayName: p.name, cnpj: p.cnpj });
    if (!r.ok && r.error.code !== "ALREADY_ACCREDITED") fail(r.error);
    console.log(`${r.ok ? "accredited" : "already accredited"} ${p.name} (${p.role})`);
  }
  unwrap(await c.onboardIssuer.execute({ issuer: await c.signerRef("labX") }));

  const trail: [string, string, number?][] = [
    ["labX", "SHIPPED"], ["carrierZ", "RECEIVED", 4.6], ["carrierZ", "SHIPPED"], ["distY", "RECEIVED"],
    ["distY", "SHIPPED"], ["pharmaW", "RECEIVED"], ["pharmaW", "DISPENSED"],
  ];
  const lots = [{ lot: lotA, product: "Demo Amoxicilina 500 mg" }, { lot: lotB, product: "Demo Amoxicilina 500 mg" }];
  for (const { lot, product } of lots) {
    const reg = await c.registerBatch.execute({
      issuer: await c.signerRef("labX"), gtin: GTIN, lot, expiry: EXPIRY, productName: product, dosage: "500 mg", country: "BR",
    });
    if (!reg.ok && reg.error.code !== "BATCH_ALREADY_CERTIFIED") fail(reg.error);
    if (!reg.ok) { console.log(`lot ${lot} already certified, custody kept`); continue; }
    console.log(`lot ${lot} certified`);
    for (const [who, type, temp] of trail) {
      unwrap(await c.recordCustodyEvent.execute({
        actor: await c.signerRef(who), gtin: GTIN, lot, type, ...(temp !== undefined ? { temperatureC: temp } : {}),
      }));
      console.log(`  ${who} ${type}`);
      await sleep(1500); // distinct block times keep the trail order unambiguous
    }
  }
  unwrap(await c.raiseAlert.raise({
    by: c.authority, gtin: GTIN, lot: lotB, level: "RECALL", reasonCode: "ANVISA-DEMO-001", publicNote: "Recall demonstrativo: não utilize este lote.",
  }));
  console.log(`alert RECALL on lot ${lotB}`);

  console.log("\nLinks:");
  for (const lot of [lotA, lotB, lotC]) console.log(`  ${c.publicBaseUrl}/01/02001234567893/10/${lot}`);
  console.log(`\nUnit seals, after "cph units:init --as labX" and "cph units:seal --as labX --gtin ${GTIN} --lot ${lotA} --serials 0001-0010":`);
  console.log(`  ${c.publicBaseUrl}/01/02001234567893/10/${lotA}/21/0001   sealed`);
  console.log(`  ${c.publicBaseUrl}/01/02001234567893/10/${lotA}/21/9999   never sealed`);
});

await program.parseAsync();
