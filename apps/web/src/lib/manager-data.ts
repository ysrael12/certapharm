import type { Participant, ParticipantRole } from "@certapharm/domain";
import type { DirectoryAlert, DirectoryBatch } from "@certapharm/application";
import { readContainer, writeContainer } from "./container";

export const ROLE_TITLE: Record<ParticipantRole, string> = {
  MANUFACTURER: "Manufacturer", IMPORTER: "Importer", DISTRIBUTOR: "Distributor", CARRIER: "Carrier", PHARMACY: "Pharmacy",
};
export const ALERT_TITLE: Record<string, string> = {
  RECALL: "Recall", SUSPECTED_COUNTERFEIT: "Suspected counterfeit", COLD_CHAIN_BREACH: "Cold chain breach", REGULATOR_NOTICE: "Regulator notice",
};

export const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

const utc = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
export const fmtUtcTime = (unix: number) => utc({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(unix * 1000));
export const fmtUtcShort = (unix: number) => utc({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(unix * 1000)).replace(",", "");
export const fmtDay = (unix: number) => utc({ day: "2-digit", month: "short", year: "numeric" }).format(new Date(unix * 1000));

export interface DirectoryView {
  readonly participants: Participant[];
  readonly batches: DirectoryBatch[];
  readonly alerts: DirectoryAlert[];
  readonly error?: string;
  readonly explorerTx: (sig: string) => string;
  readonly explorerAddress: (a: string) => string;
  readonly cluster: string;
}

/** Everything the manager screens list. A failed read becomes `error`, never a thrown page. */
export async function loadDirectory(): Promise<DirectoryView> {
  try {
    const c = await readContainer();
    const [p, b, a] = await Promise.all([c.directory.participants(), c.directory.batches(), c.directory.alertList()]);
    const failed = [p, b, a].find((r) => !r.ok);
    return {
      participants: p.ok ? p.value : [], batches: b.ok ? b.value : [], alerts: a.ok ? a.value : [],
      ...(failed && !failed.ok ? { error: failed.error.message } : {}),
      explorerTx: c.explorerTx, explorerAddress: c.explorerAddress, cluster: c.cluster,
    };
  } catch (e) {
    return {
      participants: [], batches: [], alerts: [], error: e instanceof Error ? e.message : String(e),
      explorerTx: (s) => s, explorerAddress: (a) => a, cluster: "devnet",
    };
  }
}

export interface Actor { name: string; address: string; participant?: Participant | undefined }
export type Actors = { configured: true; actors: Actor[] } | { configured: false; reason: string };

/** Key names found in `.keys/` joined with their accreditation. Needs the write container, so it reports when writes are not set up. */
export async function loadActors(participants: Participant[]): Promise<Actors> {
  try {
    const c = await writeContainer();
    const keys = await c.knownKeyNames();
    return { configured: true, actors: keys.map((k) => ({ name: k.name, address: k.address, participant: participants.find((p) => p.wallet === k.address) })) };
  } catch (e) {
    return { configured: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
