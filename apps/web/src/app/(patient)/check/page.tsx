import { Icon } from "@/components/icons";
import { Shell, withLang } from "@/components/patient";
import { resolveLang } from "@/lib/i18n";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string; error?: string }> }) {
  const sp = await searchParams;
  const lang = resolveLang(sp.lang);
  const pt = lang === "pt";
  return (
    <Shell lang={lang} path="/check">
      <main style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <section className="band" style={{ background: "var(--ink-bg)", color: "var(--on-ink)", paddingBlock: "36px 40px", gap: 16 }}>
          <span className="eyebrow" style={{ color: "var(--cph-ok)" }}>{pt ? "Verificação pública" : "Public check"}</span>
          <h1 style={{ fontSize: 34 }}>{pt ? "Este remédio é de verdade?" : "Is this medicine real?"}</h1>
          <p style={{ fontSize: 17 }}>
            {pt ? "Escaneie o QR da caixa e veja de onde ele veio. Sem cadastro, sem aplicativo." : "Scan the QR on the box and see where it came from. No account, no app."}
          </p>
        </section>
        <div className="actions" style={{ paddingTop: 20 }}>
          <a className="btn primary" href={withLang("/scan", lang)} style={{ minHeight: 56, fontSize: 18 }}>
            <Icon name="camera" /><span>{pt ? "Escanear a caixa" : "Scan the box"}</span>
          </a>
        </div>
        <form className="sec actions" style={{ border: 0, gap: 12 }} action="/go" method="get">
          {pt && <input type="hidden" name="lang" value="pt" />}
          <div className="field">
            <label htmlFor="code">{pt ? "Ou digite o código" : "Or type the code"}</label>
            <input id="code" name="code" inputMode="text" autoComplete="off" spellCheck={false} placeholder="02001234567893 · L2026D" required aria-describedby={sp.error ? "code-error" : undefined} aria-invalid={sp.error ? true : undefined} />
            {sp.error && <span id="code-error" role="alert" className="muted">{pt ? "Não entendemos esse código. Digite o GTIN e o lote, ou cole o link da caixa." : "We couldn't read that code. Type the GTIN and lot, or paste the link from the box."}</span>}
          </div>
          <button className="btn" type="submit"><span>{pt ? "Verificar" : "Check"}</span><Icon name="arrow" /></button>
        </form>
        <section className="sec" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
          <h2>{pt ? "Como funciona" : "How it works"}</h2>
          <p>
            {pt ? "O fabricante registra o lote. Cada etapa do transporte é assinada. Você vê o resultado em segundos." : "The maker registers the lot. Each leg of transport is signed. You see the result in seconds."}
          </p>
        </section>
      </main>
      <footer className="foot"><span className="badge">devnet demo</span></footer>
    </Shell>
  );
}
