import { NextResponse } from "next/server";
import { readContainer } from "@/lib/container";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const present = (name: string) => Boolean(process.env[name]);

/**
 * GET /api/health: what the deployment can see, as yes/no answers. It never prints a value or an error message,
 * because RPC errors can carry the API key in the URL.
 */
export async function GET() {
  const env = {
    RPC_URL: present("RPC_URL"),
    PLATFORM_AUTHORITY: present("PLATFORM_AUTHORITY"),
    SEAL_TREES: present("SEAL_TREES"),
    PUBLIC_BASE_URL: present("PUBLIC_BASE_URL"),
    MANAGER_TOKEN: present("MANAGER_TOKEN"),
  };
  let container: "ok" | "error" = "error";
  let chain: "ok" | "error" | "skipped" = "skipped";
  try {
    const c = await readContainer();
    container = "ok";
    // One cheap read through the same adapters the verdict uses.
    chain = (await c.directory.participants()).ok ? "ok" : "error";
  } catch {
    container = "error";
  }
  return NextResponse.json({ env, container, chain }, { headers: { "Cache-Control": "no-store" } });
}
