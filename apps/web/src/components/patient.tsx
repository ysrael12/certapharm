import type { ReactNode } from "react";
import type { Verdict } from "@certapharm/domain";
import { ALERT_HEADLINE, EVENT_LABEL, FINDING_COPY, VERDICT_COPY, fmtDateTime, fmtMonthYear, fmtTemp, regionName, t, type Lang } from "@/lib/i18n";
import type { LoadedReport } from "@/lib/report";
import { Icon } from "./icons";

const langHref = (path: string, lang: Lang) => (lang === "pt" ? path : `${path}?lang=pt`);
const withLang = (path: string, lang: Lang) => (lang === "pt" ? `${path}?lang=pt` : path);
export { withLang };

export function Shell({ lang, path, back, children, footer }: { lang: Lang; path: string; back?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href={back ? withLang(back, lang) : withLang("/", lang)} aria-label="Certapharm">
          <Icon name={back ? "back" : "check"} />
          <span>Certapharm</span>
        </a>
        <nav className="lang" aria-label={lang === "pt" ? "Idioma" : "Language"}>
          <a href={path} lang="en" aria-current={lang === "en" ? "true" : "false"}>EN</a>
          <a href={langHref(path, lang === "pt" ? "en" : "pt")} lang="pt-BR" aria-current={lang === "pt" ? "true" : "false"}>PT</a>
        </nav>
      </header>
      {children}
      {footer}
    </div>
  );
}

export function DemoFooter({ lang, cluster, checkedAt }: { lang: Lang; cluster: string; checkedAt?: number }) {
  return (
    <footer className="foot">
      {cluster !== "mainnet-beta" && <span className="badge">{cluster} demo</span>}
      {checkedAt !== undefined && (
        <span>{lang === "pt" ? "Verificado em" : "Checked at"} <span className="mono">{fmtDateTime(checkedAt, lang)}</span></span>
      )}
    </footer>
  );
}

const BAND: Record<Verdict, { cls: string; icon: "check" | "warn" | "xcircle" }> = {
  AUTHENTIC: { cls: "ok", icon: "check" },
  AUTHENTIC_WITH_ALERT: { cls: "warn", icon: "warn" },
  NOT_RECOGNIZED: { cls: "bad", icon: "xcircle" },
};

const PHARMACIST = { en: "Talk to your pharmacist before using.", pt: "Fale com o farmacêutico antes de usar." };

/** The approved mobile mock (fidelidade.webp): a tall band with icon and headline, then a flat body. */
export function VerdictView({ loaded, lang, path }: { loaded: LoadedReport; lang: Lang; path: string }) {
  const { report: r, query } = loaded;
  const pt = lang === "pt";
  const band = BAND[r.verdict];
  const copy = VERDICT_COPY[r.verdict];
  const notices = r.findings.flatMap((f) => (FINDING_COPY[f.code] ? [t(FINDING_COPY[f.code]!, lang)] : []));
  const proof = withLang(`/audit/${loaded.batchKey}`, lang);
  const product = r.batch ? `${r.batch.productName}` : "";

  return (
    <div className="app">
      <header className={`vband ${band.cls}`}>
        <div className="vtop">
          <a className="brand" href={withLang("/", lang)} aria-label="Certapharm"><Icon name="check" /><span>Certapharm</span></a>
          <nav className="lang" aria-label={pt ? "Idioma" : "Language"}>
            <a href={path} lang="en" aria-current={lang === "en" ? "true" : "false"}>EN</a>
            <a href={`${path}?lang=pt`} lang="pt-BR" aria-current={pt ? "true" : "false"}>PT</a>
          </nav>
        </div>
        <Icon name={band.icon} className="big" />
        <h1 id="verdict">{t(copy.headline, lang)}</h1>
      </header>

      <main className="vbody" aria-labelledby="verdict">
        <p className="sr" role="status">{r.verdict === "AUTHENTIC_WITH_ALERT" ? `${PHARMACIST[lang]}` : t(copy.sub, lang)}</p>

        {r.verdict === "AUTHENTIC" && r.batch && (
          <>
            <p className="vname">{r.batch.productName}</p>
            <div className="vmeta">
              <span>{pt ? "Lote" : "Lot"} {query.lot} · {pt ? "val." : "exp"} {fmtMonthYear(r.batch.expiry)}</span>
              <span>{r.batch.issuer.displayName ?? r.batch.issuer.wallet} · {regionName(r.batch.country, lang)}</span>
            </div>
            {r.trail.length > 0 && (
              <>
                <hr className="vrule" />
                <ul className="vlist" aria-label={pt ? "Caminho da caixa" : "Path of this box"}>
                  {r.trail.map((e) => (
                    <li key={e.signature}>
                      <span>
                        {t(EVENT_LABEL[e.type], lang)} · {e.actorName ?? "-"}
                        {e.temperatureC !== undefined && <> · {fmtTemp(e.temperatureC, lang)}</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {r.verdict === "AUTHENTIC_WITH_ALERT" && (
          <>
            <p className="vtitle">{r.alert ? t(ALERT_HEADLINE[r.alert.level], lang) : (notices[0] ?? t(copy.sub, lang))}</p>
            <div className="vmeta">
              <span>{product ? `${product} · ` : ""}{pt ? "Lote" : "Lot"} {query.lot}{r.alert ? ` · ${r.alert.reasonCode}` : ""}</span>
              {r.alert && <span>{r.alert.publicNote}</span>}
              {r.alert && notices.map((n) => <span key={n}>{n}</span>)}
              {!r.alert && notices.slice(1).map((n) => <span key={n}>{n}</span>)}
              <span>{PHARMACIST[lang]}</span>
            </div>
            <a className="vbtn" href={proof}>{pt ? "Ver detalhes" : "See details"}</a>
          </>
        )}

        {r.verdict === "NOT_RECOGNIZED" && (
          <>
            <p className="vtitle">{pt ? "Nenhum registro encontrado" : "No record found"}</p>
            <div className="vmeta">
              <span>{pt ? "Este lote nunca foi certificado. Não compre nem use." : "This lot was never certified. Don't buy or use it."}</span>
              <span className="mono">GTIN {query.gtin} · {pt ? "Lote" : "Lot"} {query.lot}{query.serial ? ` · ${query.serial}` : ""}</span>
            </div>
            <a className="vbtn bad" href="https://www.gov.br/anvisa" rel="noopener noreferrer">{pt ? "Denunciar à Anvisa" : "Report to Anvisa"}</a>
            <a className="vlink" href={withLang("/scan", lang)}><Icon name="camera" />{pt ? "Escanear de novo" : "Scan again"}</a>
          </>
        )}

        {r.verdict !== "AUTHENTIC_WITH_ALERT" && (
          <a className="vlink" href={proof}>{pt ? "Ver a prova pública" : "See the public proof"}<Icon name="arrow" /></a>
        )}
      </main>
      <DemoFooter lang={lang} cluster={loaded.cluster} checkedAt={loaded.checkedAt} />
    </div>
  );
}

export function ProblemScreen({ lang, path, kind }: { lang: Lang; path: string; kind: "unreadable" | "unavailable" }) {
  const copy = {
    unreadable: { en: ["We couldn't read this code", "Check that you scanned the QR code or DataMatrix on the box, then try again."], pt: ["Não conseguimos ler este código", "Confira se você escaneou o QR ou o DataMatrix da caixa e tente de novo."] },
    unavailable: { en: ["We can't check right now", "The record is temporarily out of reach. This is not a verdict. Try again in a moment."], pt: ["Não conseguimos verificar agora", "O registro está fora do ar por um instante. Isto não é um veredito. Tente de novo daqui a pouco."] },
  }[kind][lang];
  return (
    <Shell lang={lang} path={path}>
      <main>
        <section className="sec" aria-labelledby="problem">
          <h2 id="problem">{copy[0]}</h2>
          <p role="status">{copy[1]}</p>
        </section>
        <div className="actions">
          <a className="btn primary" href={kind === "unavailable" ? withLang(path, lang) : withLang("/scan", lang)}>
            <Icon name={kind === "unavailable" ? "arrow" : "camera"} />
            <span>{kind === "unavailable" ? (lang === "pt" ? "Tentar de novo" : "Try again") : (lang === "pt" ? "Escanear de novo" : "Scan again")}</span>
          </a>
        </div>
      </main>
    </Shell>
  );
}
