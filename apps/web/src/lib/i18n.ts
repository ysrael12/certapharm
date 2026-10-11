import type { AlertLevel, CustodyEventType, ParticipantRole, Verdict } from "@certapharm/domain";

export type Lang = "en" | "pt";
export const resolveLang = (v: string | string[] | undefined): Lang => (v === "pt" ? "pt" : "en");
export const htmlLang = (l: Lang): string => (l === "pt" ? "pt-BR" : "en");

type Pair = { en: string; pt: string };
const p = (en: string, pt: string): Pair => ({ en, pt });

export const VERDICT_COPY: Record<Verdict, { headline: Pair; sub: Pair }> = {
  AUTHENTIC: {
    headline: p("Authentic", "Procedente"),
    sub: p("Registered by an authorized maker. Custody trail intact.", "Registrado por fabricante autorizado. Trilha de custódia íntegra."),
  },
  AUTHENTIC_WITH_ALERT: {
    headline: p("Authentic, with alert", "Procedente, com alerta"),
    sub: p("Talk to your pharmacist before using.", "Fale com o farmacêutico antes de usar."),
  },
  NOT_RECOGNIZED: {
    headline: p("Not recognized", "Não reconhecido"),
    sub: p("We found no record of this product. Don't buy or use it. Report it to Anvisa.", "Não encontramos registro deste produto. Não compre nem use. Denuncie à Anvisa."),
  },
};

export const ALERT_LABEL: Record<AlertLevel, Pair> = {
  RECALL: p("Lot recall", "Recolhimento do lote"),
  SUSPECTED_COUNTERFEIT: p("Suspected counterfeit", "Suspeita de falsificação"),
  COLD_CHAIN_BREACH: p("Cold chain breach", "Quebra da cadeia fria"),
  REGULATOR_NOTICE: p("Notice from the regulator", "Aviso do órgão regulador"),
};

/** Plain-language notices for the patient. Codes without an entry are not shown to patients. */
export const FINDING_COPY: Record<string, Pair> = {
  BATCH_EXPIRED: p("This batch is past its expiry date.", "Este lote está vencido."),
  CUSTODY_GAP: p("Part of this box's path is missing from the record.", "Falta uma parte do caminho desta caixa no registro."),
  CUSTODY_ROLE_NOT_ALLOWED: p("A step in the path was recorded by the wrong kind of company.", "Uma etapa do caminho foi registrada por um tipo de empresa não permitido."),
  COLD_CHAIN_BREACH_REPORTED: p("A temperature outside 2-8 °C was reported on the way.", "Foi registrada uma temperatura fora de 2-8 °C no caminho."),
};

export const EVENT_VERB: Record<CustodyEventType, Pair> = {
  SHIPPED: p("shipped", "enviou"),
  RECEIVED: p("received", "recebeu"),
  STORED: p("stored", "armazenou"),
  DISPENSED: p("dispensed", "dispensou"),
};
export const EVENT_LABEL: Record<CustodyEventType, Pair> = {
  SHIPPED: p("Shipped", "Enviado"),
  RECEIVED: p("Received", "Recebido"),
  STORED: p("Stored", "Armazenado"),
  DISPENSED: p("Dispensed", "Dispensado"),
};

/** Bold line under the band on the alert screen (approved mock: "Recall in effect"). */
export const ALERT_HEADLINE: Record<AlertLevel, Pair> = {
  RECALL: p("Recall in effect", "Recolhimento em vigor"),
  SUSPECTED_COUNTERFEIT: p("Suspected counterfeit", "Suspeita de falsificação"),
  COLD_CHAIN_BREACH: p("Cold chain breach", "Quebra da cadeia fria"),
  REGULATOR_NOTICE: p("Notice from the regulator", "Aviso do órgão regulador"),
};

export const fmtMonthYear = (unixSeconds: number): string => {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
export const regionName = (code: string, lang: Lang): string => {
  try { return new Intl.DisplayNames([locale(lang)], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
};

export const ROLE_LABEL: Record<ParticipantRole, Pair> = {
  MANUFACTURER: p("manufacturer", "fabricante"),
  IMPORTER: p("importer", "importador"),
  DISTRIBUTOR: p("distributor", "distribuidora"),
  CARRIER: p("carrier", "transportadora"),
  PHARMACY: p("pharmacy", "farmácia"),
};

export const t = (pair: Pair, lang: Lang): string => pair[lang];

const tz = "America/Sao_Paulo";
const locale = (lang: Lang) => (lang === "pt" ? "pt-BR" : "en-GB");

export function fmtDateTime(unixSeconds: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: "2-digit", month: lang === "pt" ? "2-digit" : "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
  }).format(new Date(unixSeconds * 1000)).replace(",", "");
}
export function fmtDate(unixSeconds: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: "2-digit", month: lang === "pt" ? "2-digit" : "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(unixSeconds * 1000));
}
export function fmtTemp(c: number, lang: Lang): string {
  return `${c.toLocaleString(locale(lang), { maximumFractionDigits: 1 })} °C`;
}
