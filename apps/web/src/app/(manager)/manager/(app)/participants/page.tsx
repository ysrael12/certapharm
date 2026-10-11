import { Chip, Page, PageHead, ReadError, Strip } from "@/components/manager";
import { ROLE_TITLE, loadDirectory, short } from "@/lib/manager-data";
import { accredit, revoke } from "../actions";
import { ActionForm, ConfirmForm } from "../forms";

export const metadata = { title: "Certapharm Manager · Participants" };

export default async function Participants() {
  const d = await loadDirectory();
  return (
    <Page>
      <PageHead crumb="Participants" title="Participants" lede="Only the Platform Authority accredits. Only accredited wallets can certify batches or sign custody events." />
      <ReadError message={d.error} />
      <div className="grid2">
        <section className="panel">
          <h2>Accredit a participant</h2>
          <ActionForm action={accredit} submit="Accredit" note={<p className="sign">Signed by the Platform Authority. The platform pays the network fee.</p>}>
            <div className="field"><label htmlFor="wallet">Wallet or key name</label><input id="wallet" name="wallet" className="mono" placeholder="labx, or a base58 address" autoComplete="off" spellCheck={false} required /><span className="hint">A new key name creates a demo key on the server.</span></div>
            <div className="field"><label htmlFor="name">Public name</label><input id="name" name="name" placeholder="Laboratório Demo" required /><span className="hint">Patients see this name on the verdict page.</span></div>
            <div className="field"><label htmlFor="role">Role</label>
              <select id="role" name="role" defaultValue="MANUFACTURER">{Object.entries(ROLE_TITLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="cnpj">CNPJ</label><input id="cnpj" name="cnpj" className="mono" inputMode="numeric" placeholder="00.000.000/0000-00" autoComplete="off" required /><span className="hint">Only its SHA-256 is stored. The number itself is never written anywhere.</span></div>
          </ActionForm>
        </section>
        <section className="panel">
          <h2>Accredited participants ({d.participants.length})</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Wallet</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {d.participants.length === 0 && <tr><td colSpan={5} className="muted">Nobody is accredited yet.</td></tr>}
                {d.participants.map((p) => (
                  <tr key={p.wallet}>
                    <td><b>{p.displayName}</b><small>CNPJ hash {p.legalIdHash.slice(0, 6)}…</small></td>
                    <td>{ROLE_TITLE[p.role]}</td>
                    <td><a className="mono" href={d.explorerAddress(p.wallet)} rel="noopener noreferrer">{short(p.wallet)}</a></td>
                    <td><Chip kind="ok">Accredited</Chip></td>
                    <td><ConfirmForm action={revoke} hidden={{ wallet: p.wallet }} label="Revoke" confirmLabel="Confirm revoke" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Strip kind="warn">Revoking closes the accreditation. Batches from a revoked maker show “Not recognized” to patients.</Strip>
        </section>
      </div>
    </Page>
  );
}
