import { NextResponse, type NextRequest } from "next/server";
import { Gs1DigitalLink } from "@certapharm/domain";

/** Turns whatever a person typed or a camera read into the GS1 route. A GS1 link or element string passes through; "GTIN LOT" also works. */
export function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("code") ?? "").trim();
  const pt = req.nextUrl.searchParams.get("lang") === "pt";
  const suffix = pt ? "?lang=pt" : "";
  const fail = () => NextResponse.redirect(new URL(`/check?error=1${pt ? "&lang=pt" : ""}`, req.url));

  let link = Gs1DigitalLink.parse(raw);
  if (!link.ok) {
    const parts = raw.split(/[\s,;·|]+/).filter(Boolean);
    if (parts.length === 2 && /^\d+$/.test(parts[0]!)) link = Gs1DigitalLink.parse(`/01/${parts[0]}/10/${encodeURIComponent(parts[1]!)}`);
  }
  if (!link.ok) return fail();
  return NextResponse.redirect(new URL(`${Gs1DigitalLink.toPath(link.value)}${suffix}`, req.url));
}
