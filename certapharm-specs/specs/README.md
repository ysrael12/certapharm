# Certapharm — Implementation Specs (SDK-only MVP)

> Proof of origin for every medicine box, verifiable by anyone, on Solana.
> Colosseum 2026 · Solana track · submission deadline **12 Oct 2026**.

These specs are written to be handed, file by file, to a coding agent. Every file is
self-contained, uses the same ubiquitous language (see `01-domain-ddd.md`), and ends with
acceptance criteria you can turn into tests.

## Scope decision

**No custom on-chain program.** Certapharm composes existing Solana programs through their
TypeScript SDKs:

| Need | Solana primitive | TS package (pinned) |
|---|---|---|
| Who may issue (accreditation) | Solana Attestation Service (SAS) — Credential + `participant` schema | `sas-lib@1.0.10` |
| Batch certificate of origin | SAS attestation, `batch` schema | `sas-lib@1.0.10` |
| Regulatory alert on a batch | SAS attestation, `batch-alert` schema | `sas-lib@1.0.10` |
| Signed custody events | Memo program + Solana Pay–style reference key | `@solana/kit@5.5.x` (memo ix built by hand) |
| Per-unit seal | Compressed NFT (Bubblegum V2) | `@metaplex-foundation/mpl-bubblegum@6.0.0` + Umi |
| Public read | RPC + DAS API (for cNFTs) | `@solana/kit@5.5.x`, Helius/Triton devnet RPC with DAS |

> **Version pin warning.** `sas-lib@1.0.10` depends on `@solana/kit ^5`. The latest kit is 8.x and
> `@solana-program/memo` requires kit ^8. **Pin `@solana/kit@5.5.x` workspace-wide and build
> the memo instruction by hand** (it is 10 lines — see `02-onchain-model.md §4`). Bubblegum runs
> on Umi, a separate stack; the adapter converts the same 64-byte secret key into a Umi signer.

## Files

| File | What it gives the agent |
|---|---|
| `01-domain-ddd.md` | Ubiquitous language, bounded contexts, aggregates, value objects, invariants, domain events, verdict policy |
| `02-onchain-model.md` | Exact SAS credential/schemas/layout bytes, PDA + nonce derivation, memo wire format, Bubblegum tree + metadata |
| `03-architecture.md` | Hexagonal layout, monorepo tree, port interfaces (TypeScript), adapters, env/config |
| `04-use-cases.md` | Every application service: input, preconditions, steps, errors, Given/When/Then |
| `05-verification-api-ui.md` | GS1 Digital Link routes, JSON contract, the three verdict screens, palette |
| `06-delivery-plan.md` | Hour-by-hour plan to 12 Oct, cut list, demo script, test plan |
| `../diagrams/*.puml` | PlantUML sources; rendered `.svg`/`.png` beside them |

## Diagrams

| # | Diagram | Shows |
|---|---|---|
| 01 | `01-context-map` | Bounded contexts and their relationships (DDD context map) |
| 02 | `02-domain-model` | Aggregates, entities, value objects, domain events |
| 03 | `03-batch-lifecycle` | Batch state machine as the verifier sees it |
| 04 | `04-seq-register-batch` | Accreditation + batch registration sequence |
| 05 | `05-seq-custody-event` | Signed custody event sequence |
| 06 | `06-seq-verify` | Public QR verification sequence and verdict policy |
| 07 | `07-components` | Hexagonal components: ports, adapters, Solana programs |
| 08 | `08-onchain-accounts` | On-chain account map (SAS PDAs, memo txs, Merkle tree) |

Render locally: `java -jar plantuml.jar -tsvg diagrams/*.puml`.

## Non-negotiable core (cannot be cut)

1. Register a batch with a signed SAS attestation by an accredited manufacturer.
2. Record at least 3 signed custody events (distributor → pharmacy → dispensed).
3. Public verification page: scan → one of three verdicts in < 2 s.

Everything else (unit cNFT seals, operator UI, alerts UI) is ordered in the cut list in `06-delivery-plan.md`.
