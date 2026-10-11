import Link from "next/link";
import { Icon } from "@/components/icons";
import { Chip, Page, PageHead, ReadError, Tx } from "@/components/manager";
import { readContainer } from "@/lib/container";
import { ALERT_TITLE, ROLE_TITLE, fmtDay, fmtUtcTime, loadDirectory, short } from "@/lib/manager-data";

export const metadata = { title: "Certapharm Manager · Overview" };

export default async function Overview() {
  const d = await loadDirectory();
  const c = await readContainer().catch(() => undefined);
  const trails = c ? await Promise.all(d.batches.slice(0, 10).map(async (b) => ({ b, events: await c.adapters.custody.readTrail(b.batchKey).catch(() => []) }))) : [];
  const byWallet = new Map(d.participants.map((p) => [p.wallet as string, p]));
  const events = trails.flatMap(({ b, events }) => events.map((e) => ({ ...e, lot: b.lot })))
    .sort((x, y) => y.occurredAt - x.occurredAt).slice(0, 6);
  const total = trails.reduce((n, t) => n + t.events.length, 0);
  const latest = events[0];

  return (
    <Page>
      <PageHead crumb="Overview" title="Overview" lede="What is registered on devnet now, and what needs attention." />
      <ReadError message={d.error} />
      <section className="stats" aria-label="Totals">
        <div className="stat"><span>Participants</span><b>{d.participants.length}</b><small>All accredited</small></div>
        <div className="stat"><span>Batches</span><b>{d.batches.length}</b><small>Certified and live</small></div>
        <div className="stat"><span>Custody events</span><b>{total}</b><small>{latest ? `Latest ${fmtDay(latest.occurredAt)}` : "None yet"}</small></div>
        <div className="stat"><span>Active alerts</span><b>{d.alerts.length}</b><small>{d.alerts.length === 1 ? "1 batch affected" : `${d.alerts.length} batches affected`}</small></div>
      </section>
      <div className="grid2 wide">
        <section className="panel">
          <h2>Recent custody events <Link className="btn sm" href="/manager/custody"><Icon name="plus" />Record event</Link></h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Time (UTC)</th><th>Event</th><th>Actor</th><th>Batch</th><th>Transaction</th></tr></thead>
              <tbody>
                {events.length === 0 && <tr><td colSpan={5} className="muted">No custody events yet. Record the first one.</td></tr>}
                {events.map((e) => {
                  const who = byWallet.get(e.actor);
                  return (
                    <tr key={e.signature}>
                      <td className="num mono">{fmtUtcTime(e.occurredAt)}</td>
                      <td>{e.type === "DISPENSED" ? <Chip kind="ok">Dispensed</Chip> : <Chip kind="off">{e.type.charAt(0) + e.type.slice(1).toLowerCase()}</Chip>}</td>
                      <td><b>{who?.displayName ?? short(e.actor)}</b><small>{who ? ROLE_TITLE[who.role] : "Not accredited"}</small></td>
                      <td className="mono">{e.lot}</td>
                      <td><Tx href={d.explorerTx(e.signature)} sig={e.signature} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Needs attention</h2>
          <div className="body">
            {d.alerts.length === 0 && <p className="muted">No active alerts.</p>}
            {d.alerts.map((a) => (
              <div key={a.batchKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Chip kind="warn">{ALERT_TITLE[a.level] ?? a.level}</Chip>
                <p><b>{a.lot ?? short(a.batchKey)}</b> · {a.reasonCode}</p>
                <p className="muted">{a.publicNote}</p>
              </div>
            ))}
            <div className="actions" style={{ justifyContent: "flex-start" }}><Link className="btn" href="/manager/alerts">Manage alerts</Link></div>
          </div>
        </section>
      </div>
    </Page>
  );
}
