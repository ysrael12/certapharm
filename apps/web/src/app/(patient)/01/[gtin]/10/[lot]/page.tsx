import { ProblemScreen, VerdictView } from "@/components/patient";
import { resolveLang } from "@/lib/i18n";
import { loadReport } from "@/lib/report";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export async function generateMetadata({ params }: { params: Promise<{ gtin: string; lot: string }> }) {
  const { lot } = await params;
  return { title: `Certapharm · ${safeDecode(lot)}` };
}

export default async function BatchPage({ params, searchParams }: {
  params: Promise<{ gtin: string; lot: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { gtin, lot } = await params;
  const lang = resolveLang((await searchParams).lang);
  const path = `/01/${gtin}/10/${lot}`;
  const r = await loadReport(`/01/${gtin}/10/${encodeURIComponent(safeDecode(lot))}`);
  if (!r.ok) return <ProblemScreen lang={lang} path={path} kind={r.error.code === "LINK_UNPARSEABLE" ? "unreadable" : "unavailable"} />;
  return <VerdictView loaded={r.value} lang={lang} path={path} />;
}
