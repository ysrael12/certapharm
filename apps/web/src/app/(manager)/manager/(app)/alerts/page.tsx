import { ALERT_LEVELS } from "@certapharm/domain";
import { Chip, Page, PageHead, ReadError, Strip } from "@/components/manager";
import { ALERT_TITLE, fmtDay, loadDirectory, short } from "@/lib/manager-data";
import { clearAlert, raiseAlert } from "../actions";
import { ActionForm, ConfirmForm } from "../forms";

export const metadata = { title: "Certapharm Manager · Alerts" };

export default async function Alerts() {
  const d = await loadDirectory();
  const first = d.batches[0];
  return (
    <Page>
      <PageHead crumb="Alerts" title="Alerts" lede="Only the Platform Authority raises or clears an alert. Raising on a lot that already has one replaces it." />
      <ReadError message={d.error} />
      <div className="grid2">
        <section className="panel">
          <h2>Raise an alert</h2>
          <ActionForm action={raiseAlert} submit="Raise alert" note={<Strip>Patients will see <b>Authentic, with alert</b> for this lot.</Strip>}>
            <div className="row2">
              <div className="field"><label htmlFor="gtin">GTIN</label><input id="gtin" name="gtin" className="mono" defaultValue={first?.gtin ?? "02001234567893"} required /></div>
              <div className="field"><label htmlFor="lot">Lot</label><input id="lot" name="lot" className="mono" placeholder={first?.lot ?? "L2026D"} list="lots" required /><datalist id="lots">{d.batches.map((b) => <option key={b.batchKey} value={b.lot} />)}</datalist></div>
            </div>
            <div className="field"><label htmlFor="level">Level</label>
              <select id="level" name="level" defaultValue="RECALL">{ALERT_LEVELS.map((l) => <option key={l} value={l}>{ALERT_TITLE[l]}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="reason">Reason code</label><input id="reason" name="reason" className="mono" placeholder="ANVISA-2026-001" maxLength={32} required /></div>
            <div className="field"><label htmlFor="note">Public note</label><textarea id="note" name="note" maxLength={140} placeholder="Shown to patients, in plain language." required /><span className="hint">Up to 140 bytes. Patients read this on the verdict page.</span></div>
          </ActionForm>
        </section>
        <section className="panel">
          <h2>Active alerts ({d.alerts.length})</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Lot</th><th>Level</th><th>Reason</th><th>Raised</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {d.alerts.length === 0 && <tr><td colSpan={5} className="muted">No active alerts.</td></tr>}
                {d.alerts.map((a) => (
                  <tr key={a.batchKey}>
                    <td className="mono">{a.lot ?? short(a.batchKey)}</td>
                    <td><Chip kind="warn">{ALERT_TITLE[a.level] ?? a.level}</Chip></td>
                    <td><b className="mono" style={{ fontWeight: 500 }}>{a.reasonCode}</b><small>{a.publicNote}</small></td>
                    <td className="num">{fmtDay(a.raisedAt)}</td>
                    <td>{a.gtin && a.lot ? <ConfirmForm action={clearAlert} hidden={{ gtin: a.gtin, lot: a.lot }} label="Clear" confirmLabel="Confirm clear" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Strip>An alert never makes a lot “Not recognized”. Only a missing or invalid certificate does.</Strip>
        </section>
      </div>
    </Page>
  );
}
