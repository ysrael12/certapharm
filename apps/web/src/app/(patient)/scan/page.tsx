import { Shell } from "@/components/patient";
import { resolveLang } from "@/lib/i18n";
import { Scanner } from "./scanner";

export const metadata = { title: "Certapharm · Scan" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = resolveLang((await searchParams).lang);
  return (
    <Shell lang={lang} path="/scan" back="/" footer={
      <footer className="foot">
        <span className="badge">devnet demo</span>
        <span>{lang === "pt" ? "A câmera só lê o código. Nada é gravado." : "The camera only reads the code. Nothing is saved."}</span>
      </footer>
    }>
      <Scanner lang={lang} />
    </Shell>
  );
}
