"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { isEventAllowed, type CustodyEventType, type ParticipantRole } from "@certapharm/domain";
import { Icon } from "@/components/icons";
import type { ActionState } from "./action-state";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={state.ok ? "result" : "strip warn"}>
      <Icon name={state.ok ? "check" : "warn"} />
      <span>
        {state.message}
        {state.tx && <> <a className="mono" href={state.tx} rel="noopener noreferrer">View transaction</a></>}
      </span>
    </p>
  );
}

/** A form that runs a server action, shows progress on the button and the outcome underneath. Resets after a success. */
export function ActionForm({ action, submit, children, note }: { action: Action; submit: string; children: ReactNode; note?: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="body">
      {children}
      {note}
      <div className="actions">
        <button className="btn ghost" type="reset">Cancel</button>
        <button className="btn primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Working…" : submit}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Two clicks: the first arms the button, the second sends. Used for actions that cannot be undone. */
export function ConfirmForm({ action, hidden, label, confirmLabel }: { action: Action; hidden: Record<string, string>; label: string; confirmLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [armed, setArmed] = useState(false);
  // Arming lasts five seconds, so a stray click never sends a destructive action later.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <form action={formAction} style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {armed ? (
        <button key="send" className="btn sm bad" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Working…" : confirmLabel}</button>
      ) : (
        /* A distinct key makes React mount a new element. Reusing the button would turn the arming click into a submit. */
        <button key="arm" className="btn sm bad" type="button" onClick={() => setArmed(true)}>{label}</button>
      )}
      {state && !state.ok && <span role="alert" className="hint">{state.message}</span>}
    </form>
  );
}

export interface ActorOption { name: string; label: string; role?: ParticipantRole | undefined }

/** Actor and event pickers that stay in step: an event the actor's role may not record is disabled. */
export function CustodyFields({ actors, defaultGtin, defaultLot }: { actors: ActorOption[]; defaultGtin: string; defaultLot: string }) {
  const [actor, setActor] = useState(actors[0]?.name ?? "");
  const role = actors.find((a) => a.name === actor)?.role;
  const types: CustodyEventType[] = ["SHIPPED", "RECEIVED", "STORED", "DISPENSED"];
  const firstAllowed = types.find((t) => !role || isEventAllowed(role, t));
  const [type, setType] = useState<CustodyEventType>("SHIPPED");
  const current = role && !isEventAllowed(role, type) ? firstAllowed ?? type : type;
  return (
    <>
      <div className="field">
        <label htmlFor="actor">Acting as</label>
        <select id="actor" name="actor" value={actor} onChange={(e) => setActor(e.target.value)} required>
          {actors.map((a) => <option key={a.name} value={a.name}>{a.label}</option>)}
        </select>
      </div>
      <div className="row2">
        <div className="field"><label htmlFor="gtin">GTIN</label><input id="gtin" name="gtin" className="mono" defaultValue={defaultGtin} inputMode="numeric" required /></div>
        <div className="field"><label htmlFor="lot">Lot</label><input id="lot" name="lot" className="mono" defaultValue={defaultLot} required /></div>
      </div>
      <fieldset className="field">
        <legend>Event</legend>
        <div className="seg">
          {types.map((t) => {
            const allowed = !role || isEventAllowed(role, t);
            return (
              <label key={t}>
                <input type="radio" name="type" value={t} checked={current === t} disabled={!allowed} onChange={() => setType(t)} />
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </label>
            );
          })}
        </div>
        <span className="hint">{role ? `A ${role.toLowerCase()} can record ${types.filter((t) => isEventAllowed(role, t)).map((t) => t.toLowerCase()).join(", ")}.` : "The options follow the actor's role."}</span>
      </fieldset>
      <div className="row2">
        <div className="field"><label htmlFor="temp">Temperature (°C)</label><input id="temp" name="temp" inputMode="decimal" placeholder="4.6" /><span className="hint">Optional</span></div>
        <div className="field"><label htmlFor="site">Site</label><input id="site" name="site" className="mono" placeholder="DC-SP-01" /><span className="hint">Only a short hash is stored</span></div>
      </div>
    </>
  );
}
