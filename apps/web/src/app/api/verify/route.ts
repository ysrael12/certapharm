import { NextResponse, type NextRequest } from "next/server";
import { loadReport, toApiResponse } from "@/lib/report";

export const maxDuration = 30;

const CACHE = "public, s-maxage=15, stale-while-revalidate=60";

/** GET /api/verify?link=<urlencoded GS1 Digital Link or element string>. Spec 05 section 2. */
export async function GET(req: NextRequest) {
  const link = req.nextUrl.searchParams.get("link");
  if (!link) return NextResponse.json({ error: "LINK_UNPARSEABLE" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const r = await loadReport(link);
  if (!r.ok) {
    if (r.error.code === "LINK_UNPARSEABLE") return NextResponse.json({ error: "LINK_UNPARSEABLE" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(toApiResponse(r.value), { headers: { "Cache-Control": CACHE } });
}
