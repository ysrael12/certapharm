# 05 — Public Verification: API and UI

Diagram: `06-seq-verify`. App: `apps/web` (Next.js 15, App Router, server components, no client wallet).

## 1. Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | page | Landing: one sentence, a camera button, a "type the code" field |
| `/scan` | page (client) | Camera QR / DataMatrix reader (`@zxing/browser`), redirects to the GS1 route |
| `/01/[gtin]/10/[lot]` | page (SSR) | Verdict for a batch |
| `/01/[gtin]/10/[lot]/21/[serial]` | page (SSR) | Verdict for a unit |
| `/api/verify?link=<urlencoded GS1 link or element string>` | JSON | Same report, for apps and auditors |
| `/api/seal/[gtin]/[lot]/[serial].json` | JSON | cNFT metadata `uri` target |
| `/audit/[batchKey]` | page | Raw evidence: attestation addresses + every tx signature with explorer links |

GS1 Digital Link means a plain phone camera opening the printed QR lands directly on the verdict page.
`/scan` exists for DataMatrix codes (most phone cameras don't open those natively).

## 2. JSON contract — `GET /api/verify`

```jsonc
{
  "verdict": "AUTHENTIC" | "AUTHENTIC_WITH_ALERT" | "NOT_RECOGNIZED",
  "findings": [{ "code": "ALERT_RECALL", "severity": "warning", "message": "Recall: ANVISA-DEMO-001" }],
  "query": { "gtin": "02001234567893", "lot": "L2026A", "serial": "0001" },
  "batch": {
    "batchKey": "…base58…",
    "productName": "Demo Amoxicilina 500 mg",
    "dosage": "500 mg, 21 capsules",
    "expiry": "2027-12-31",
    "country": "BR",
    "issuer": { "wallet": "…", "displayName": "Laboratório Demo", "role": "MANUFACTURER" },
    "certificate": { "attestation": "…", "explorerUrl": "https://explorer.solana.com/address/…?cluster=devnet" }
  },
  "alert": { "level": "RECALL", "reasonCode": "ANVISA-DEMO-001", "publicNote": "…" } ,
  "trail": [
    { "type": "SHIPPED", "actor": { "displayName": "Laboratório Demo", "role": "MANUFACTURER" },
      "at": "2026-10-11T13:02:11Z", "temperatureC": null, "signature": "…", "explorerUrl": "…" }
  ],
  "unit": { "serial": "0001", "seal": "SEALED" | "REVOKED" | "NOT_FOUND" | "NOT_CHECKED", "assetId": "…" },
  "checkedAt": "2026-10-11T13:05:00Z",
  "cluster": "devnet"
}
```

- `400 { "error": "LINK_UNPARSEABLE" }` for bad input; never 404 for an unknown batch (that is a valid `NOT_RECOGNIZED` answer).
- `Cache-Control: public, s-maxage=15, stale-while-revalidate=60`.
- Rate limit: 30 req/min per IP (Next middleware + in-memory LRU is enough for the demo).

## 3. Verdict screens (patient-facing copy)

Mobile-first, one screen, the answer visible without scrolling. Plain Portuguese for the patient, English toggle for the jury (`?lang=en`, default `pt-BR`; the demo video uses EN).

| Verdict | Color band | Icon | Headline (EN / PT) | Subline (EN / PT) |
|---|---|---|---|---|
| AUTHENTIC | Steel Blue `#669bbc` band, text `#003049` | check-circle | **Authentic** / **Procedente** | Registered by an authorized maker. Custody trail intact. / Registrado por fabricante autorizado. Trilha de custódia íntegra. |
| AUTHENTIC_WITH_ALERT | Amber `#e0a100` band, text `#003049` | warning | **Authentic, with alert** / **Procedente, com alerta** | `{alert.publicNote}` — Talk to your pharmacist before using. / Fale com o farmacêutico antes de usar. |
| NOT_RECOGNIZED | Brick Red `#c1121f` band, text `#fdf0d5` | warning | **Not recognized** / **Não reconhecido** | We found no record of this product. Don't buy or use it. Report it to Anvisa. / Não encontramos registro deste produto. Não compre nem use. Denuncie à Anvisa. |

Below the band, in this order: product name + dosage + lot + expiry → issuer name → custody trail as a
vertical timeline (role icon, company, event, date, temperature) → "See the proof on Solana" link to
`/audit/[batchKey]`.

Rules
- Color never carries meaning alone: every verdict has its headline word and icon.
- Red (`#c1121f`) appears **only** on NOT_RECOGNIZED. Brand accents elsewhere use Deep Space Blue.
- No crypto words on the patient screen (no "wallet", "NFT", "token", "attestation"). Those live on `/audit`.
- Show `checkedAt` and "devnet demo" badge while on devnet.

## 4. Palette tokens

```css
:root {
  --cph-ink: #003049;        /* Deep Space Blue: text, header, brand */
  --cph-paper: #fdf0d5;      /* Papaya Whip: background */
  --cph-ok: #669bbc;         /* Steel Blue: AUTHENTIC band, links on dark */
  --cph-warn: #e0a100;       /* Amber: AUTHENTIC_WITH_ALERT only */
  --cph-bad: #c1121f;        /* Brick Red: NOT_RECOGNIZED only */
  --cph-bad-deep: #780000;   /* Molten Lava: pressed/hover states of bad, pitch accent */
  --cph-muted: #3d5a6c;      /* secondary text on paper */
}
```

Type: Space Grotesk (headings) + IBM Plex Sans (body), same as the pitch deck.

## 5. Acceptance criteria

- [ ] Opening the printed QR of demo batch A on a phone shows **Authentic** in < 2 s (p95 measured with 20 sequential requests; log the numbers for the README).
- [ ] Batch B shows **Authentic, with alert** and the recall note; batch C shows **Not recognized**.
- [ ] `/api/verify` returns exactly the JSON shape above (zod schema test).
- [ ] Lighthouse mobile: Accessibility ≥ 95; verdict text contrast ≥ 4.5:1.
- [ ] `/audit/[batchKey]` lists the certificate attestation and every custody tx with working explorer links.
