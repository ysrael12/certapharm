import type { ReactNode } from "react";
import { Icon } from "./icons";

export function PageHead({ crumb, title, lede, children }: { crumb: string; title: string; lede: string; children?: ReactNode }) {
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/manager">Manager</a><span aria-hidden="true">/</span><span>{crumb}</span></nav>
      <header className="head"><div><h1>{title}</h1><p>{lede}</p></div>{children}</header>
    </>
  );
}

export function Chip({ kind, children }: { kind: "ok" | "warn" | "bad" | "off"; children: ReactNode }) {
  const icon = kind === "ok" ? "check" : kind === "off" ? null : "warn";
  return <span className={`chip ${kind}`}>{icon && <Icon name={icon} />}{children}</span>;
}

export function Strip({ kind = "info", children }: { kind?: "info" | "warn"; children: ReactNode }) {
  return <p className={`strip${kind === "warn" ? " warn" : ""}`}><Icon name={kind === "warn" ? "warn" : "info"} /><span>{children}</span></p>;
}

export const Tx = ({ href, sig }: { href: string; sig: string }) => (
  <a className="mono" href={href} rel="noopener noreferrer">{sig.slice(0, 8)}…{sig.slice(-4)}</a>
);

export function Page({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}

export function ReadError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <Strip kind="warn">Some data could not be read from devnet: {message}</Strip>;
}
