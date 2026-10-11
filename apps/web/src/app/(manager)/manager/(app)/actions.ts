"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@certapharm/domain";
import { invalidateRead, writeContainer } from "@/lib/container";
import { isManager } from "@/lib/manager-auth";
import type { ActionState } from "./action-state";

const KEY_NAME = /^[a-z][a-z0-9-]{1,31}$/;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Runs one write with the session check, a readable error, and cache invalidation. */
async function run(fn: (c: Awaited<ReturnType<typeof writeContainer>>) => Promise<{ message: string; tx?: string }>): Promise<ActionState> {
  if (!(await isManager())) return { ok: false, message: "Your session ended. Sign in again." };
  try {
    const c = await writeContainer();
    const out = await fn(c);
    invalidateRead();
    revalidatePath("/manager", "layout");
    return { ok: true, message: out.message, ...(out.tx ? { tx: out.tx } : {}) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

/** Use cases return a Result; a failure becomes a thrown message that `run` shows to the person. */
function unwrap<T>(r: Result<T, { message: string }>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

async function walletFrom(c: Awaited<ReturnType<typeof writeContainer>>, value: string) {
  const isName = KEY_NAME.test(value);
  if (!isName && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new Error("Enter a base58 address or a key name such as labx (lowercase letters, digits, dashes).");
  return c.resolveWallet(value);
}

export async function accredit(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const wallet = await walletFrom(c, text(f, "wallet"));
    const { participant, tx } = unwrap(await c.accreditParticipant.execute({
      by: c.authority, wallet, role: text(f, "role"), displayName: text(f, "name"), cnpj: text(f, "cnpj"),
    }));
    return { message: `${participant.displayName} is now accredited as ${participant.role}.`, tx: tx.explorerUrl };
  });
}

export async function revoke(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const { tx } = unwrap(await c.revokeParticipant.execute({ by: c.authority, wallet: text(f, "wallet") }));
    return { message: "Accreditation revoked.", tx: tx.explorerUrl };
  });
}

export async function certify(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const issuer = await c.signerRef(text(f, "issuer"));
    unwrap(await c.onboardIssuer.execute({ issuer })); // idempotent: creates the issuer credential on first use
    const { batch, verifyUrl } = unwrap(await c.registerBatch.execute({
      issuer, gtin: text(f, "gtin"), lot: text(f, "lot"), expiry: text(f, "expiry"),
      productName: text(f, "product"), dosage: text(f, "dosage"), country: text(f, "country") || "BR",
    }));
    return { message: `Batch ${batch.lot} certified. Public page: ${verifyUrl}` };
  });
}

export async function recordEvent(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const temp = text(f, "temp");
    const temperatureC = temp === "" ? undefined : Number(temp.replace(",", "."));
    if (temperatureC !== undefined && Number.isNaN(temperatureC)) throw new Error("Temperature must be a number, for example 4.6.");
    const site = text(f, "site");
    const { tx } = unwrap(await c.recordCustodyEvent.execute({
      actor: await c.signerRef(text(f, "actor")), gtin: text(f, "gtin"), lot: text(f, "lot"), type: text(f, "type"),
      ...(temperatureC !== undefined ? { temperatureC } : {}), ...(site ? { siteId: site } : {}),
    }));
    return { message: `${text(f, "type").toLowerCase()} recorded for lot ${text(f, "lot")}.`, tx: tx.explorerUrl };
  });
}

export async function raiseAlert(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const { tx } = unwrap(await c.raiseAlert.raise({
      by: c.authority, gtin: text(f, "gtin"), lot: text(f, "lot"), level: text(f, "level"),
      reasonCode: text(f, "reason"), publicNote: text(f, "note"),
    }));
    return { message: "Alert raised. Patients now see “Authentic, with alert” for this lot.", tx: tx.explorerUrl };
  });
}

export async function clearAlert(_prev: ActionState, f: FormData): Promise<ActionState> {
  return run(async (c) => {
    const { tx } = unwrap(await c.raiseAlert.clear({ by: c.authority, gtin: text(f, "gtin"), lot: text(f, "lot") }));
    return { message: "Alert cleared.", tx: tx.explorerUrl };
  });
}
