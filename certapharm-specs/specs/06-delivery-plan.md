# 06 — Delivery Plan (solo, Sat 10 → Mon 12 Oct 2026)

Times are America/Fortaleza (UTC−3). **First action: check the exact submission cut-off on the Colosseum
Arena and convert it to UTC−3.** Plan assumes you submit by Monday 18:00 at the latest.

## 1. Order of work

| When | Block | Output | Spec |
|---|---|---|---|
| Sat 13:00–14:00 | Repo scaffold, pnpm workspace, lint rule, env, Helius devnet key, fund keys | `pnpm -r build` green | 03 |
| Sat 14:00–15:00 | **Spikes S1, S2, S3** as throwaway scripts in `apps/cli/spikes/` | 3 devnet signatures saved in `SPIKES.md` | 02 §7 |
| Sat 15:00–17:30 | Domain: shared kernel VOs, aggregates, `VerdictPolicy` + unit tests | `pnpm --filter domain test` green | 01 |
| Sat 17:30–21:00 | Adapters SAS + Memo; UC1–UC5 + CLI | `cph batch:register` and `cph custody:record` work on devnet | 02, 04 |
| Sat 21:00–23:00 | UC6 VerifyProduct + `cph verify` | Three demo verdicts correct from the CLI | 04 |
| Sun 09:00–13:00 | `apps/web`: GS1 routes, verdict screens, `/api/verify`, `/audit` | Local phone test over LAN | 05 |
| Sun 13:00–14:30 | UC10 `demo:seed`, QR PNGs, deploy to Vercel | Public URL works on 4G | 04, 05 |
| Sun 14:30–18:00 | **Cut-line work** (in order): UC8 alert CLI → UC7 seals → UC9 withdraw | Whatever fits | 04 |
| **Sun 20:00** | **Code freeze.** Tag `v0.1.0-hackathon` | — | — |
| Sun 20:00–23:00 | README (EN), architecture image, measured p95 + cost numbers | README done | — |
| Mon 08:00–11:00 | Record technical demo video (≤ 3 min), then pitch video (≤ 3 min) | Two unlisted YouTube links | — |
| Mon 11:00–13:00 | Arena submission: description, links, deck PDF, repo, X account | **Submitted** | — |
| Mon 13:00+ | Buffer | — | — |

## 2. Cut list (drop from the top when late)

1. UC9 WithdrawBatch
2. Operator web UI (CLI only — already the plan)
3. UC7 Unit seals (cNFT) → say "per-unit seals: next" in the pitch; slide 6 step 04 becomes roadmap
4. Custody reference pattern → fallback `custody_index` projection (02 §4)
5. `/audit` page → link straight to explorer from the verdict page

**Never cut:** UC4 RegisterBatch, UC5 RecordCustodyEvent, UC6 VerifyProduct + the three verdict screens.

## 3. Test plan

| Layer | Tool | What |
|---|---|---|
| Domain | vitest | VO validation tables; role×event matrix; VerdictPolicy R1–R8 + spam memo |
| Application | vitest + in-memory fakes | Every Given/When/Then in `04-use-cases.md` |
| Adapters | vitest, devnet, `describe.skipIf(!process.env.RPC_URL)` | Round-trip create → read for each SAS schema; memo write → readTrail |
| E2E | `cph demo:seed && cph verify` | Exact verdicts A/B/C; script exits non-zero on mismatch |
| Perf | small script | 20 sequential `/api/verify` calls → p50/p95 in README |

## 4. README outline (English, required)

1. One-liner + 20-second GIF of the phone scan
2. Problem (2 lines, WHO + Anvisa) → Solution (3 verdicts)
3. Architecture image (`07-components.png`) + "Why no custom program"
4. On-chain footprint table with **devnet addresses**: platform credential, schemas, demo issuer credential, demo batch attestations, tree
5. Run it: prerequisites, `.env`, `pnpm i`, `pnpm cph demo:seed`, `pnpm --filter web dev`
6. Measured numbers: p95 verify latency, lamports per custody event, cost per sealed unit
7. Security model (two credential types, what each key can do, known limitations)
8. Roadmap: Anchor program for on-chain custody rules, Token-2022 freeze, ERP ingestion, mainnet
9. License: Apache-2.0

## 5. Technical demo video script (≤ 3 min)

| t | Screen | Say |
|---|---|---|
| 0:00 | Architecture diagram | "No custom program: SAS for identity and certificates, Memo for custody, Bubblegum for unit seals." |
| 0:25 | Terminal: `cph demo:seed` (pre-recorded, sped up) | "The platform accredits four companies; the lab registers batch A." |
| 0:55 | Explorer: batch attestation account | "Here's the certificate of origin — signed by the lab's own credential, so nobody else can withdraw it." |
| 1:15 | Terminal: custody events + explorer memo | "Each hand-off is a signed memo referencing the batch key." |
| 1:40 | Phone scanning QR A → Authentic | "A patient scans. No wallet. Authentic, with the full trail." |
| 2:05 | QR B → alert; QR C → not recognized | "Recall shows up instantly. An unregistered lot is rejected." |
| 2:30 | `/audit` page + README numbers | "Every claim links to the chain. p95 under X seconds, Y lamports per event." |

## 6. Known limitations (say them before the judges do)

- Custody rules (role × event, order) are enforced at read time, not on-chain; a custom Anchor program is the roadmap item that moves them on-chain.
- Platform Authority is a single key on devnet; production uses a multisig (Squads).
- Seal lookup depends on a rebuildable off-chain index (`serial → leafIndex`).
- DAS-capable RPC is a dependency for unit seals.
