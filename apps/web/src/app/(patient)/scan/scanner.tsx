"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

type State = "starting" | "looking" | "denied" | "unsupported";

/** Reads QR and DataMatrix with the device camera, then hands the text to /go, which finds the GS1 route. */
export function Scanner({ lang }: { lang: Lang }) {
  const pt = lang === "pt";
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>("starting");

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState("unsupported"); return; }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video.current ?? undefined, (result) => {
          if (!result || cancelled) return;
          cancelled = true;
          controls.stop();
          window.location.assign(`/go?code=${encodeURIComponent(result.getText())}${pt ? "&lang=pt" : ""}`);
        });
        stop = () => controls.stop();
        if (!cancelled) setState("looking");
      } catch {
        setState("denied");
      }
    })();
    return () => { cancelled = true; stop?.(); };
  }, [pt]);

  const message = {
    starting: pt ? "Abrindo a câmera…" : "Opening the camera…",
    looking: pt ? "Procurando código…" : "Looking for a code…",
    denied: pt ? "Não foi possível usar a câmera. Permita o acesso ou digite o código." : "We couldn't use the camera. Allow access or type the code instead.",
    unsupported: pt ? "Este navegador não abre a câmera. Digite o código." : "This browser can't open the camera. Type the code instead.",
  }[state];

  return (
    <main style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <section style={{ background: "var(--scan-bg)", color: "var(--cph-paper)", flex: 1, minHeight: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "24px var(--gutter)" }}>
        <div style={{ position: "relative", width: "min(72vw, 280px)", aspectRatio: "1", overflow: "hidden", background: "#000" }}>
          <video ref={video} muted playsInline aria-label={pt ? "Imagem da câmera" : "Camera view"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {[
            { top: 0, left: 0, borderTop: "4px solid", borderLeft: "4px solid" },
            { top: 0, right: 0, borderTop: "4px solid", borderRight: "4px solid" },
            { bottom: 0, left: 0, borderBottom: "4px solid", borderLeft: "4px solid" },
            { bottom: 0, right: 0, borderBottom: "4px solid", borderRight: "4px solid" },
          ].map((s, i) => <i key={i} aria-hidden="true" style={{ position: "absolute", width: 44, height: 44, color: "var(--cph-ok)", ...s }} />)}
        </div>
        <p style={{ textAlign: "center", fontSize: 16, maxWidth: "28ch" }}>
          {pt ? "Aponte a câmera para o QR ou DataMatrix da caixa." : "Point the camera at the box's QR or DataMatrix."}
        </p>
        <p className="mono" style={{ color: "var(--cph-ok)", textAlign: "center" }} role="status">{message}</p>
      </section>
      <div className="actions">
        <a className="btn" href={pt ? "/?lang=pt" : "/"}>{pt ? "Digitar o código" : "Type the code instead"}</a>
      </div>
    </main>
  );
}
