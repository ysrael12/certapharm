import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { htmlLang, resolveLang } from "@/lib/i18n";
import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Certapharm · Proof of origin for every medicine box",
  description: "Scan the code on a medicine box and see where it came from. No wallet, no app, no account.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function LandingLayout({ children }: { children: ReactNode }) {
  const lang = resolveLang((await headers()).get("x-cph-lang") ?? undefined);
  return (
    <html lang={htmlLang(lang)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
