import { describe, expect, it } from "vitest";
import type { WalletAddress } from "@certapharm/domain";
import { makeWorld } from "../testing/fakes.js";
import { AccreditParticipant } from "./accredit-participant.js";
import { ListDirectory } from "./list-directory.js";
import { RaiseAlert } from "./raise-alert.js";
import { RegisterBatch } from "./register-batch.js";
import { RevokeParticipant } from "./revoke-participant.js";

const w = (n: string) => n.replace(/[0OIl]/g, "x").padEnd(32, "1") as WalletAddress;
const PLATFORM = w("Platform"), LAB = w("LabX"), OTHER = w("Other");

async function world() {
  const x = makeWorld();
  const accredit = new AccreditParticipant(x.accreditation, PLATFORM, x.clock, x.bus);
  const register = new RegisterBatch(x.accreditation, x.certificates, x.keys, x.clock, x.bus, "https://certapharm.test");
  const alerts = new RaiseAlert(x.alerts, x.keys, PLATFORM, x.clock);
  const dir = new ListDirectory(x.accreditation, x.certificates, x.alerts, x.keys);
  const revoke = new RevokeParticipant(x.accreditation, PLATFORM);
  await accredit.execute({ by: PLATFORM, wallet: LAB, role: "MANUFACTURER", displayName: "Lab", cnpj: "12345678000199" });
  await accredit.execute({ by: PLATFORM, wallet: OTHER, role: "PHARMACY", displayName: "Pharma", cnpj: "12345678000199" });
  await register.execute({ issuer: { address: LAB }, gtin: "2001234567893", lot: "L1", expiry: "2027-12-31", productName: "P", dosage: "1 mg", country: "BR" });
  return { x, dir, alerts, revoke };
}

describe("ListDirectory", () => {
  it("lists every participant, the certified batches with their BatchKey, and alerts with the lot filled in", async () => {
    const s = await world();
    await s.alerts.raise({ by: PLATFORM, gtin: "2001234567893", lot: "L1", level: "RECALL", reasonCode: "R-1", publicNote: "n" });
    const people = await s.dir.participants();
    const batches = await s.dir.batches();
    const alerts = await s.dir.alertList();
    expect(people.ok && people.value).toHaveLength(2);
    expect(batches.ok && batches.value[0]?.batchKey).toBe("bk:02001234567893:L1");
    expect(alerts.ok && alerts.value[0]).toMatchObject({ level: "RECALL", lot: "L1" });
  });
});

describe("UC2b RevokeParticipant", () => {
  it("only the Platform Authority revokes, and the accreditation disappears", async () => {
    const s = await world();
    const bad = await s.revoke.execute({ by: LAB, wallet: OTHER });
    expect(!bad.ok && bad.error.code).toBe("NOT_PLATFORM_AUTHORITY");
    const good = await s.revoke.execute({ by: PLATFORM, wallet: OTHER });
    expect(good.ok).toBe(true);
    const people = await s.dir.participants();
    expect(people.ok && people.value).toHaveLength(1);
    const again = await s.revoke.execute({ by: PLATFORM, wallet: OTHER });
    expect(!again.ok && again.error.code).toBe("NOT_ACCREDITED");
  });
});
