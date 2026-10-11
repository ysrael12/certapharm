import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { requireManager } from "@/lib/manager-auth";
import { signOut } from "../login/actions";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

const ITEMS: { href: string; icon: IconName; label: string }[] = [
  { href: "/manager", icon: "grid", label: "Overview" },
  { href: "/manager/participants", icon: "users", label: "Participants" },
  { href: "/manager/batches", icon: "box", label: "Batches" },
  { href: "/manager/custody", icon: "route", label: "Custody" },
  { href: "/manager/alerts", icon: "bell", label: "Alerts" },
];

export default async function ManagerApp({ children }: { children: ReactNode }) {
  await requireManager();
  return (
    <>
      <header className="shellbar">
        <span className="brand"><Icon name="check" />Certapharm</span>
        <span className="sep" />
        <span className="app">Manager</span>
        <span className="sp" />
        <span className="env">devnet demo</span>
        <span className="avatar" role="img" aria-label="Platform Authority">PA</span>
      </header>
      <div className="layout">
        <aside className="side">
          <nav aria-label="Manager">{ITEMS.map((i) => <NavLink key={i.href} href={i.href} label={i.label}><Icon name={i.icon} /></NavLink>)}</nav>
          <div className="who">
            <b>Platform Authority</b>
            <form action={signOut}><button className="btn sm ghost" type="submit" style={{ paddingInline: 0 }}>Sign out</button></form>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </>
  );
}
