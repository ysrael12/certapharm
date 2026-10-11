import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { Gs1DigitalLink } from "@certapharm/domain";
import { isManager } from "@/lib/manager-auth";

export const dynamic = "force-dynamic";

/** PNG of the QR code printed on the box for one lot. Encodes the same GS1 Digital Link a phone camera opens. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ gtin: string; lot: string }> }) {
  if (!(await isManager())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { gtin, lot } = await params;
  const link = Gs1DigitalLink.parse(`/01/${gtin}/10/${lot}`);
  if (!link.ok) return NextResponse.json({ error: "LINK_UNPARSEABLE" }, { status: 400 });
  const base = (process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const png = await QRCode.toBuffer(`${base}${Gs1DigitalLink.toPath(link.value)}`, { type: "png", margin: 2, width: 512, errorCorrectionLevel: "M", color: { dark: "#003049", light: "#ffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="certapharm-${link.value.lot}.png"`, "Cache-Control": "private, no-store" },
  });
}
