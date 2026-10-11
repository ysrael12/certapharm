import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { htmlLang, resolveLang } from "@/lib/i18n";
import "@/styles/patient.css";

export const metadata: Metadata = {
  title: "Certapharm",
  description: "Check where a medicine box came from.",
  robots: { index: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function PatientLayout({ children }: { children: ReactNode }) {
  const lang = resolveLang((await headers()).get("x-cph-lang") ?? undefined);
  return (
    <html lang={htmlLang(lang)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
