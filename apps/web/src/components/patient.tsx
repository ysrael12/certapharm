import type { ReactNode } from "react";
import type { Verdict } from "@certapharm/domain";
import { ALERT_LABEL, EVENT_VERB, FINDING_COPY, ROLE_LABEL, VERDICT_COPY, fmtDate, fmtDateTime, fmtTemp, t, type Lang } from "@/lib/i18n";
import type { LoadedReport } from "@/lib/report";
import { Icon, ROLE_ICON } from "./icons";

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

const BAND: Record<Verdict, { cls: string; icon: "check" | "warn" }> = {
  AUTHENTIC: { cls: "ok", icon: "check" },
  AUTHENTIC_WITH_ALERT: { cls: "warn", icon: "warn" },
  NOT_RECOGNIZED: { cls: "bad", icon: "warn" },
};

const PHARMACIST = { en: "Talk to your pharmacist before using.", pt: "Fale com o farmacêutico antes de usar." };

export function VerdictView({ loaded, lang, path }: { loaded: LoadedReport; lang: Lang; path: string }) {
  const { report: r } = loaded;
  const band = BAND[r.verdict];
  const copy = VERDICT_COPY[r.verdict];
  const notices = r.findings.flatMap((f) => (FINDING_COPY[f.code] ? [t(FINDING_COPY[f.code]!, lang)] : []));
  const sub = r.verdict === "AUTHENTIC_WITH_ALERT"
    ? `${r.alert ? t(ALERT_LABEL[r.alert.level], lang) : (notices[0] ?? "")}. ${PHARMACIST[lang]}`
    : t(copy.sub, lang);
  const proof = `/audit/${loaded.batchKey}`;

  return (
    <Shell lang={lang} path={path} footer={<DemoFooter lang={lang} cluster={loaded.cluster} checkedAt={loaded.checkedAt} />}>
      <main>
        <section className={`band ${band.cls}`} aria-labelledby="verdict">
          <Icon name={band.icon} />
          <h1 id="verdict">{t(copy.headline, lang)}</h1>
          <p role="status">{sub}</p>
          {r.alert && <span className="code">{r.alert.reasonCode}</span>}
        </section>

        {r.verdict === "NOT_RECOGNIZED" ? (
          <>
            <section className="sec" aria-labelledby="scanned">
              <h2 id="scanned">{lang === "pt" ? "O que você escaneou" : "What you scanned"}</h2>
              <dl className="facts">
                <dt>GTIN</dt><dd className="mono">{loaded.query.gtin}</dd>
                <dt>{lang === "pt" ? "Lote" : "Lot"}</dt><dd className="mono">{loaded.query.lot}</dd>
                {loaded.query.serial && <><dt>{lang === "pt" ? "Série" : "Serial"}</dt><dd className="mono">{loaded.query.serial}</dd></>}
              </dl>
              <p className="muted">
                {lang === "pt"
                  ? "Nenhum fabricante autorizado registrou este lote. Pode ser um erro de leitura: tente escanear de novo."
                  : "No authorized maker has registered this lot. It may be a misread: try scanning again."}
              </p>
            </section>
            <div className="actions">
              <a className="btn bad" href="https://www.gov.br/anvisa" rel="noopener noreferrer">
                <Icon name="report" /><span>{lang === "pt" ? "Denunciar à Anvisa" : "Report to Anvisa"}</span>
              </a>
              <a className="btn" href={withLang("/scan", lang)}>
                <Icon name="camera" /><span>{lang === "pt" ? "Escanear de novo" : "Scan again"}</span>
              </a>
            </div>
          </>
        ) : (
          <>
            {r.alert && (
              <section className="sec" aria-labelledby="notice">
                <h2 id="notice">{lang === "pt" ? "Aviso oficial" : "Official notice"}</h2>
                <p className="note"><Icon name="warn" /><span>{r.alert.publicNote}</span></p>
              </section>
            )}
            {notices.length > 0 && !r.alert && (
              <section className="sec" aria-labelledby="notice">
                <h2 id="notice">{lang === "pt" ? "Avisos" : "Notices"}</h2>
                {notices.map((n) => <p key={n} className="note"><Icon name="warn" /><span>{n}</span></p>)}
              </section>
            )}
            {r.batch && (
              <>
                <section className="sec" aria-labelledby="product">
                  <h2 id="product">{lang === "pt" ? "Produto" : "Product"}</h2>
                  <p className="product">{r.batch.productName}</p>
                  <dl className="facts">
                    <dt>{lang === "pt" ? "Dose" : "Dose"}</dt><dd>{r.batch.dosage}</dd>
                    <dt>{lang === "pt" ? "Lote" : "Lot"}</dt><dd className="mono">{loaded.query.lot}</dd>
                    <dt>{lang === "pt" ? "Validade" : "Expiry"}</dt><dd>{fmtDate(r.batch.expiry, lang)}</dd>
                  </dl>
                </section>
                <section className="sec" aria-labelledby="maker">
                  <h2 id="maker">{lang === "pt" ? "Fabricante" : "Maker"}</h2>
                  <div className="issuer">
                    <b>{r.batch.issuer.displayName ?? r.batch.issuer.wallet}</b>
                    <span className="muted">{lang === "pt" ? "Fabricante autorizado" : "Authorized manufacturer"}</span>
                  </div>
                </section>
              </>
            )}
            {r.trail.length > 0 && (
              <section className="sec" aria-labelledby="trail">
                <h2 id="trail">{lang === "pt" ? "Caminho da caixa" : "Path of this box"}</h2>
                <ol className="trail">
                  {r.trail.map((e) => (
                    <li key={e.signature}>
                      <span className="node"><Icon name={e.actorRole ? ROLE_ICON[e.actorRole] : "box"} /></span>
                      <span>
                        <b>{e.actorName ?? "-"} {t(EVENT_VERB[e.type], lang)}</b>
                        <small>
                          {fmtDateTime(e.occurredAt, lang)}{e.actorRole ? ` · ${t(ROLE_LABEL[e.actorRole], lang)}` : ""}
                          {e.temperatureC !== undefined && <span className="temp">{fmtTemp(e.temperatureC, lang)}</span>}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
        <a className="link-row" href={withLang(proof, lang)}>
          <span>{lang === "pt" ? "Ver a prova pública" : "See the public proof"}</span><Icon name="arrow" />
        </a>
      </main>
    </Shell>
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
