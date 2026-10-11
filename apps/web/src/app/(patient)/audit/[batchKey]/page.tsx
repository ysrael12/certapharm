import { notFound } from "next/navigation";
import type { BatchKey } from "@certapharm/domain";
import { Icon } from "@/components/icons";
import { DemoFooter, Shell } from "@/components/patient";
import { readContainer } from "@/lib/container";
import { resolveLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certapharm · Public proof" };

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

/** Raw evidence for one batch: the certificate, the alert and every custody transaction, each with an explorer link. Crypto terms are allowed here. */
export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ batchKey: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { batchKey } = await params;
  if (!BASE58.test(batchKey)) notFound();
  const lang = resolveLang((await searchParams).lang);
  const pt = lang === "pt";
  const c = await readContainer();
  const key = batchKey as BatchKey;
  const issuers = await c.adapters.accreditation.listIssuers();
  const [cert, alert, unsorted] = await Promise.all([
    c.adapters.certificates.findByBatchKey(key, issuers.map((i) => i.wallet)),
    c.adapters.alerts.find(key),
    c.adapters.custody.readTrail(key),
  ]);
  // Oldest first, ties by signature, the same order the verdict uses.
  const raw = [...unsorted].sort((a, b) => a.occurredAt - b.occurredAt || a.signature.localeCompare(b.signature));
  const people = await c.adapters.accreditation.findMany([...new Set([...raw.map((e) => e.actor), ...(cert ? [cert.issuer] : [])])]);
  const issuer = cert ? people.get(cert.issuer) : undefined;
  const link = (href: string, text: string) => (
    <a className="mono" href={href} rel="noopener noreferrer">{text} <Icon name="ext" className="sm" /></a>
  );

  return (
    <Shell lang={lang} path={`/audit/${batchKey}`} back="/" footer={<DemoFooter lang={lang} cluster={c.cluster} checkedAt={c.clock.now()} />}>
      <main>
        <section className="aud-h">
          <span className="eyebrow" style={{ color: "var(--on-ink)", opacity: 0.8 }}>{pt ? "Auditoria" : "Audit"}</span>
          <h1>{pt ? "A prova pública deste lote" : "The public proof for this lot"}</h1>
          <span className="mono">BatchKey {batchKey}</span>
        </section>

        <section className="sec" aria-labelledby="cert">
          <h2 id="cert">{pt ? "Certificado de origem" : "Certificate of origin"}</h2>
          {cert ? (
            <dl className="kv">
              <div><dt>{pt ? "Atestado SAS do lote" : "Batch SAS attestation"}</dt><dd>{link(c.explorerAddress(cert.attestation), short(cert.attestation))}</dd></div>
              <div><dt>GTIN · {pt ? "Lote" : "Lot"}</dt><dd className="mono">{cert.gtin} · {cert.lot}</dd></div>
              <div><dt>{pt ? "Emissor" : "Issuer"}</dt><dd>{issuer?.displayName ?? "-"} · {link(c.explorerAddress(cert.issuer), short(cert.issuer))}</dd></div>
              <div><dt>{pt ? "Credenciamento" : "Accreditation"}</dt><dd>{issuer ? `${issuer.role}, ${pt ? "emitido pela Platform Authority" : "issued by the Platform Authority"}` : (pt ? "Sem credenciamento ativo" : "No active accreditation")}</dd></div>
              <div><dt>{pt ? "Alerta ativo" : "Active alert"}</dt><dd>{alert ? `${alert.level} · ${alert.reasonCode}` : (pt ? "Nenhum" : "None")}</dd></div>
            </dl>
          ) : (
            <p className="muted">{pt ? "Nenhum certificado ativo para este BatchKey." : "No live certificate for this BatchKey."}</p>
          )}
        </section>

        <section className="sec" aria-labelledby="events">
          <h2 id="events">{pt ? `Eventos de custódia (${raw.length})` : `Custody events (${raw.length})`}</h2>
          {raw.length === 0 ? <p className="muted">{pt ? "Nenhum evento." : "No events."}</p> : (
            <ol className="aud">
              {raw.map((e, i) => {
                const who = people.get(e.actor);
                return (
                  <li key={e.signature} className={`aud-row${who ? "" : " aud-ignored"}`}>
                    <span className="aud-n mono">{i + 1}</span>
                    <span className="aud-b">
                      <b>{e.type} <span className="muted">{who ? who.displayName : (pt ? "signatário não credenciado, ignorado" : "non-accredited signer, ignored")}{e.temperatureC !== undefined ? ` · ${e.temperatureC} °C` : ""}</span></b>
                      <small className="mono">{new Date(e.occurredAt * 1000).toISOString()}</small>
                      {link(c.explorerTx(e.signature), short(e.signature))}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="sec" aria-labelledby="redo">
          <h2 id="redo">{pt ? "Refaça a conferência" : "Re-check it yourself"}</h2>
          <p className="muted">
            {pt
              ? "Tudo acima está na rede Solana. O BatchKey sai do GTIN e do lote, e qualquer pessoa pode derivá-lo e listar as mesmas transações."
              : "Everything above is on the Solana network. The BatchKey is derived from the GTIN and lot, so anyone can derive it and list the same transactions."}
          </p>
          {cert && <a className="btn" href={`/api/verify?link=${encodeURIComponent(`/01/${cert.gtin}/10/${encodeURIComponent(cert.lot)}`)}`}>{pt ? "Ver resposta em JSON" : "See the JSON response"}<Icon name="arrow" /></a>}
        </section>
      </main>
    </Shell>
  );
}
