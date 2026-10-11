"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const path = usePathname();
  const current = href === "/manager" ? path === "/manager" : path.startsWith(href);
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}{label}</Link>;
}
