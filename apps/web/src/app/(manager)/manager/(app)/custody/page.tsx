import { CUSTODY_EVENT_TYPES, PARTICIPANT_ROLES, isEventAllowed } from "@certapharm/domain";
import { Chip, Page, PageHead, ReadError, Strip, Tx } from "@/components/manager";
import { loadReport } from "@/lib/report";
import { ROLE_TITLE, fmtUtcShort, loadActors, loadDirectory } from "@/lib/manager-data";
import { recordEvent } from "../actions";
import { ActionForm, CustodyFields } from "../forms";

export const metadata = { title: "Certapharm Manager · Custody" };

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default async function Custody({ searchParams }: { searchParams: Promise<{ lot?: string }> }) {
  const sp = await searchParams;
  const d = await loadDirectory();
  const actors = await loadActors(d.participants);
  const options = actors.configured
    ? actors.actors.filter((a) => a.participant).map((a) => ({ name: a.name, label: `${a.participant!.displayName} · ${ROLE_TITLE[a.participant!.role]}`, role: a.participant!.role }))
    : [];
  const batch = d.batches.find((b) => b.lot === sp.lot) ?? d.batches[0];
  const report = batch ? await loadReport(`/01/${batch.gtin}/10/${encodeURIComponent(batch.lot)}`) : undefined;
  const trail = report?.ok ? report.value.report.trail : [];
  // Custody integrity only: an alert or an expiry does not make the trail itself suspect.
  const custodyIssues = report?.ok ? report.value.report.findings.filter((x) => x.severity !== "info" && !x.code.startsWith("ALERT_") && x.code !== "BATCH_EXPIRED") : [];
  const intact = report?.ok && report.value.report.verdict !== "NOT_RECOGNIZED" && custodyIssues.length === 0;

  return (
    <Page>
      <PageHead crumb="Custody" title="Custody" lede="Each event is signed by the actor's own wallet. The platform pays the fee." />
      <ReadError message={d.error} />
      {!actors.configured && <Strip kind="warn">Writing is not set up on this server: {actors.reason}</Strip>}
      <div className="grid2">
        <section className="panel">
          <h2>Record an event</h2>
          {options.length === 0 ? (
            <div className="body"><p className="muted">No accredited actor key found. Accredit a participant first, then pick it here.</p></div>
          ) : (
            <ActionForm action={recordEvent} submit="Record event">
              <CustodyFields actors={options} defaultGtin={batch?.gtin ?? "02001234567893"} defaultLot={batch?.lot ?? ""} />
            </ActionForm>
          )}
        </section>
        <div className="stack">
          <section className="panel">
            <h2>
              <span>Trail for {batch?.lot ?? "-"} {batch && (intact ? <Chip kind="ok">Intact</Chip> : <Chip kind="warn">Needs review</Chip>)}</span>
              {d.batches.length > 1 && (
                <form action="/manager/custody" method="get" style={{ display: "flex", gap: 8 }}>
                  <label htmlFor="lot-pick" className="sr">Lot</label>
                  <select id="lot-pick" name="lot" defaultValue={batch?.lot} style={{ minHeight: 32, width: "auto" }}>{d.batches.map((b) => <option key={b.batchKey} value={b.lot}>{b.lot}</option>)}</select>
                  <button className="btn sm" type="submit">Show</button>
                </form>
              )}
            </h2>
            <div className="scroll">
              <table>
                <thead><tr><th>#</th><th>Event</th><th>Actor</th><th>When (UTC)</th><th>Temp</th><th>Transaction</th></tr></thead>
                <tbody>
                  {trail.length === 0 && <tr><td colSpan={6} className="muted">No accredited events for this lot yet.</td></tr>}
                  {trail.map((e, i) => (
                    <tr key={e.signature}>
                      <td className="num">{i + 1}</td><td>{title(e.type)}</td><td><b>{e.actorName ?? "-"}</b></td>
                      <td className="num mono">{fmtUtcShort(e.occurredAt)}</td>
                      <td className="num">{e.temperatureC !== undefined ? `${e.temperatureC} °C` : "–"}</td>
                      <td>{report?.ok && <Tx href={report.value.explorerTx(e.signature)} sig={e.signature} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Who can record what</h2>
            <div className="scroll">
              <table className="matrix">
                <thead><tr><th>Event</th>{PARTICIPANT_ROLES.map((r) => <th key={r}>{ROLE_TITLE[r]}</th>)}</tr></thead>
                <tbody>
                  {CUSTODY_EVENT_TYPES.map((t) => (
                    <tr key={t}><td><b>{title(t)}</b></td>{PARTICIPANT_ROLES.map((r) => { const y = isEventAllowed(r, t); return <td key={r} className={y ? "yes" : "no"}>{y ? "Yes" : "–"}</td>; })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}
