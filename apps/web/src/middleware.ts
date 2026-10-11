import { NextResponse, type NextRequest } from "next/server";

/** 30 requests per minute per IP on /api/verify. In-memory is enough for the demo (spec 05 section 2). */
const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function limited(ip: string, now: number): { limited: boolean; retryAfter: number } {
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const hit = hits.get(ip);
  if (!hit || hit.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  hit.count += 1;
  return { limited: hit.count > LIMIT, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/verify") {
    const r = limited(clientIp(req), Date.now());
    if (r.limited) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(r.retryAfter), "Cache-Control": "no-store" } });
    }
  }
  // The root layouts read the language from this header, so <html lang> is right on the first byte.
  const headers = new Headers(req.headers);
  headers.set("x-cph-lang", req.nextUrl.searchParams.get("lang") === "pt" ? "pt" : "en");
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
