import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const MANAGER_COOKIE = "cph_mgr";

const digest = (s: string) => createHash("sha256").update(`cph-manager:${s}`).digest();

/** The manager is off until MANAGER_TOKEN is set. Writes use server-held demo keys, so this gate is what stands between the internet and them. */
export const managerEnabled = (): boolean => Boolean(process.env.MANAGER_TOKEN);

export function tokenMatches(candidate: string): boolean {
  const expected = process.env.MANAGER_TOKEN;
  if (!expected) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

export const sessionValue = (): string => (process.env.MANAGER_TOKEN ? digest(process.env.MANAGER_TOKEN).toString("hex") : "");

export async function isManager(): Promise<boolean> {
  const value = (await cookies()).get(MANAGER_COOKIE)?.value;
  const expected = sessionValue();
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Pages: send visitors to the login screen. */
export async function requireManager(): Promise<void> {
  if (!(await isManager())) redirect("/manager/login");
}
