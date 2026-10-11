import { Chip, Page, PageHead, ReadError, Strip } from "@/components/manager";
import { fmtDay, loadActors, loadDirectory } from "@/lib/manager-data";
import { certify } from "../actions";
import { ActionForm } from "../forms";

export const metadata = { title: "Certapharm Manager · Batches" };

export default async function Batches() {
  const d = await loadDirectory();
  const actors = await loadActors(d.participants);
  const issuers = actors.configured ? actors.actors.filter((a) => a.participant && (a.participant.role === "MANUFACTURER" || a.participant.role === "IMPORTER")) : [];
  const alerted = new Set(d.alerts.map((a) => a.batchKey));
  const first = d.batches[0];
  const base = process.env.PUBLIC_BASE_URL ?? "";
  return (
    <Page>
      <PageHead crumb="Batches" title="Batches" lede="Certify a lot as an accredited manufacturer or importer. A GTIN and lot pair can be certified once." />
      <ReadError message={d.error} />
      {!actors.configured && <Strip kind="warn">Writing is not set up on this server: {actors.reason}</Strip>}
      <div className="grid2">
        <section className="panel">
          <h2>Certify a batch</h2>
          <ActionForm action={certify} submit="Certify batch">
            <div className="field"><label htmlFor="issuer">Issuer</label>
              <select id="issuer" name="issuer" required disabled={issuers.length === 0}>
                {issuers.length === 0 && <option value="">No accredited manufacturer or importer key</option>}
                {issuers.map((a) => <option key={a.name} value={a.name}>{a.participant?.displayName} · {a.name}</option>)}
              </select>
            </div>
            <div className="row2">
              <div className="field"><label htmlFor="gtin">GTIN</label><input id="gtin" name="gtin" className="mono" defaultValue="2001234567893" inputMode="numeric" required /><span className="hint">Stored with 14 digits</span></div>
              <div className="field"><label htmlFor="lot">Lot</label><input id="lot" name="lot" className="mono" placeholder="L2026F" required /><span className="hint">Case sensitive</span></div>
            </div>
            <div className="field"><label htmlFor="product">Product</label><input id="product" name="product" defaultValue="Demo Amoxicilina 500 mg" required /></div>
            <div className="row2">
              <div className="field"><label htmlFor="dosage">Dose</label><input id="dosage" name="dosage" defaultValue="500 mg" required /></div>
              <div className="field"><label htmlFor="expiry">Expiry</label><input id="expiry" name="expiry" type="date" defaultValue="2027-12-31" required /></div>
            </div>
            <div className="field"><label htmlFor="country">Country</label><input id="country" name="country" className="mono" defaultValue="BR" maxLength={2} required /></div>
          </ActionForm>
        </section>
        <section className="panel">
          <h2>Certified batches ({d.batches.length})</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Lot</th><th>Product</th><th>Expiry</th><th>Status</th><th>Links</th></tr></thead>
              <tbody>
                {d.batches.length === 0 && <tr><td colSpan={5} className="muted">No batches yet. Certify the first one.</td></tr>}
                {d.batches.map((b) => (
                  <tr key={b.batchKey}>
                    <td className="mono">{b.lot}</td>
                    <td><b>{b.productName}</b><small>{b.dosage}</small></td>
                    <td className="num">{fmtDay(b.expiry)}</td>
                    <td>{alerted.has(b.batchKey) ? <Chip kind="warn">Alert</Chip> : <Chip kind="ok">Certified</Chip>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <a href={`/01/${b.gtin}/10/${encodeURIComponent(b.lot)}`}>Open</a>{" · "}
                      <a href={`/manager/qr/${b.gtin}/${encodeURIComponent(b.lot)}`} download={`certapharm-${b.lot}.png`}>QR</a>{" · "}
                      <a href={`/audit/${b.batchKey}`}>Proof</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {first && (
            <div className="body" style={{ borderTop: "1px solid var(--line)" }}>
              <b>Link printed on the box for lot {first.lot}</b>
              <p className="mono muted" style={{ wordBreak: "break-all" }}>{base}/01/{first.gtin}/10/{encodeURIComponent(first.lot)}</p>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
