# Certapharm

Proof of origin for every medicine box, verifiable by anyone, on Solana.
Built for the Colosseum 2026 hackathon (Solana track).

## Problem and solution

Falsified and diverted medicines reach patients because a box carries no proof that a real, accredited maker
released that lot. A patient scans the printed GS1 QR code and gets one of three verdicts, with no wallet:

| Verdict | Meaning |
|---|---|
| **Authentic** | Lot registered by an accredited maker, custody trail intact |
| **Authentic, with alert** | Same, plus an active recall or notice |
| **Not recognized** | No record of this product |

## Architecture: no custom program

Everything composes existing Solana programs through TypeScript SDKs.

| Concern | Used |
|---|---|
| Accreditation, batch certificate, alerts | Solana Attestation Service (`sas-lib@1.0.10`) |
| Custody events | Memo v2 plus a reference key (`getSignaturesForAddress(batchKey)`) |
| Per-unit seals (optional) | Bubblegum V2 compressed NFTs |
| Reads | RPC plus DAS |

Hexagonal layout in pnpm workspaces: `packages/domain` (pure TS), `packages/application` (use cases and ports),
`packages/infra-solana` (adapters), `apps/cli` (`cph`, the only writer), `apps/web` (Next.js, read-only).
Specs are in `certapharm-specs/specs/`, diagrams in `certapharm-specs/diagrams/`.

## Status (first delivery)

- [x] Monorepo scaffold, strict TypeScript, ESLint rule that keeps Solana imports out of `domain` and `application`
- [x] Design system (`design/design-system.html`)
- [x] Spikes S1, S2 and S3 passed on devnet (see `apps/cli/SPIKES.md`)
- [x] Domain layer: GS1 value objects, aggregates, `VerdictPolicy` R1-R8 (91 unit tests)
- [ ] Use cases UC1 to UC6, adapters, CLI, web verification page

## Run it

Prerequisites: Node 20+, pnpm 9.

```sh
cp .env.example .env     # set RPC_URL to a DAS-capable devnet RPC (Helius)
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
pnpm --filter @certapharm/cli exec tsx spikes/s1-sas.ts
```

Demo keys are written to `./.keys/` (gitignored). `@solana/kit` is pinned to 5.5.x across the workspace.

## Security model and limits

- Two credential types: the Platform Authority accredits and raises alerts; each manufacturer holds its own issuer credential and can only create or withdraw its own batches.
- Custody rules (role by event) are enforced when writing and reported as findings when reading; they are not enforced on-chain.
- The Platform Authority is a single key on devnet; production would use a multisig.

## Roadmap

Anchor program for on-chain custody rules, Token-2022 freeze, ERP ingestion, mainnet.

## License

Apache-2.0 (license file to be added).
