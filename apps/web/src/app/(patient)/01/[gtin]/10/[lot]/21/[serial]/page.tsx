import { ProblemScreen, VerdictView } from "@/components/patient";
import { resolveLang } from "@/lib/i18n";
import { loadReport } from "@/lib/report";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export async function generateMetadata({ params }: { params: Promise<{ lot: string; serial: string }> }) {
  const { lot, serial } = await params;
  return { title: `Certapharm · ${safeDecode(lot)} · ${safeDecode(serial)}` };
}

export default async function UnitPage({ params, searchParams }: {
  params: Promise<{ gtin: string; lot: string; serial: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { gtin, lot, serial } = await params;
  const lang = resolveLang((await searchParams).lang);
  const path = `/01/${gtin}/10/${lot}/21/${serial}`;
  const link = `/01/${gtin}/10/${encodeURIComponent(safeDecode(lot))}/21/${encodeURIComponent(safeDecode(serial))}`;
  const r = await loadReport(link);
  if (!r.ok) return <ProblemScreen lang={lang} path={path} kind={r.error.code === "LINK_UNPARSEABLE" ? "unreadable" : "unavailable"} />;
  return <VerdictView loaded={r.value} lang={lang} path={path} />;
}
