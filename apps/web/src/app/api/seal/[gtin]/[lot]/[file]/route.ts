import { NextResponse, type NextRequest } from "next/server";
import { Gs1DigitalLink } from "@certapharm/domain";
import { readContainer } from "@/lib/container";

/**
 * GET /api/seal/{gtin}/{lot}/{serial}.json: the `uri` stored in every seal's metadata (spec 05 section 1).
 * It only names the unit and its BatchKey. The proof is the asset itself, not this file.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ gtin: string; lot: string; file: string }> }) {
  const { gtin, lot, file } = await params;
  if (!file.endsWith(".json")) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const serial = decodeURIComponent(file.slice(0, -".json".length));
  const link = Gs1DigitalLink.parse(`/01/${gtin}/10/${lot}/21/${encodeURIComponent(serial)}`);
  if (!link.ok) return NextResponse.json({ error: "LINK_UNPARSEABLE" }, { status: 400 });
  const c = await readContainer();
  const batchKey = await c.keys.derive(link.value.gtin, link.value.lot);
  return NextResponse.json(
    { gtin: link.value.gtin, lot: link.value.lot, serial: link.value.serial, batchKey },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
