"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MANAGER_COOKIE, sessionValue, tokenMatches } from "@/lib/manager-auth";

export async function signIn(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  if (!tokenMatches(token)) redirect("/manager/login?error=1");
  (await cookies()).set(MANAGER_COOKIE, sessionValue(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/manager", maxAge: 8 * 60 * 60,
  });
  redirect("/manager");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete({ name: MANAGER_COOKIE, path: "/manager" });
  redirect("/manager/login");
}
