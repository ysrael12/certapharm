# Certapharm

Prova de origem para cada caixa de medicamento, verificável por qualquer pessoa, na Solana.
Colosseum 2026 (trilha Solana) — **entrega até 12/out/2026**. Specs em `certapharm-specs/specs/`, diagramas em `certapharm-specs/diagrams/` (`.puml` é a fonte; `.svg/.png` são renderizados).

## Decisão de escopo
**Sem programa on-chain próprio.** Tudo compõe programas existentes via SDK TypeScript:
SAS (`sas-lib@1.0.10`) para credenciamento, certificado de lote e alertas · Memo + chave de referência para eventos de custódia · Bubblegum V2 (`mpl-bubblegum@6.0.0`, Umi) para selo por unidade · RPC + DAS para leitura.

**Pin obrigatório:** `@solana/kit@5.5.x` em todo o workspace (`pnpm.overrides`). O memo ix e, se preciso, o transfer de 0 lamports são montados à mão (`specs/02-onchain-model.md §4`). Não atualize o kit.

## Núcleo inegociável (nunca cortar)
1. Registrar lote com attestation SAS assinada por fabricante credenciado (UC4).
2. ≥ 3 eventos de custódia assinados (distribuidor → farmácia → dispensado) (UC5).
3. Página pública: scan → um de três vereditos em < 2 s (UC6).

Ordem de corte (do topo): UC9 withdraw → UI de operador → UC7 selos cNFT → custody_index fallback → `/audit`. Ver `specs/06-delivery-plan.md`.

## Arquitetura (hexagonal, pnpm workspaces)
```
packages/domain         TS puro, zero deps: shared, gs1, accreditation, origin, custody, sealing, alerts, verification
packages/application    use cases (um arquivo cada) + ports (interfaces)
packages/infra-solana   adapters: sas/, memo/, bubblegum/, projections/ (libsql)
packages/runtime        composition root (modo `read` sem chave, modo `write` assina); CLI e web usam o mesmo
apps/cli                `cph` (commander) — escrita por terminal
apps/web                Next.js 15 App Router: páginas públicas só leitura e sem chave; `/manager` escreve com chaves demo no servidor, atrás de MANAGER_TOKEN
```
Regras:
- `domain` e `application` **nunca** importam `@solana/*`, `sas-lib`, `@metaplex-foundation/*` (ESLint `no-restricted-imports`).
- Sem I/O nem `Date.now()` no domínio; injete `Clock`.
- Use cases retornam `Result<Ok, DomainError | InfraError>`; só adapters lançam exceção.
- A chain é a fonte da verdade; projeções off-chain (`unit_seals`, `custody_index`) devem ser reconstruíveis.
- `apps/web` builda sem `PLATFORM_SECRET`; as páginas públicas só precisam de `RPC_URL` e `PLATFORM_AUTHORITY`. Chaves demo em `./.keys/*.json` (gitignored). `/manager` fica desligado sem `MANAGER_TOKEN`; é atalho de devnet (em produção, cada empresa assina com a própria wallet).
- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; `zod` só nas bordas; `pino` para logs; `vitest` para testes.

## Linguagem ubíqua (use exatamente estes termos no código, UI e logs)
Platform Authority · Participant · Role (`MANUFACTURER|IMPORTER|DISTRIBUTOR|CARRIER|PHARMACY`) · Accreditation · Batch/BatchKey · CertificateOfOrigin · CustodyEvent (`SHIPPED|RECEIVED|STORED|DISPENSED`) · CustodyTrail · Unit · UnitSeal · BatchAlert (`RECALL|SUSPECTED_COUNTERFEIT|COLD_CHAIN_BREACH|REGULATOR_NOTICE`) · Verdict (`AUTHENTIC|AUTHENTIC_WITH_ALERT|NOT_RECOGNIZED`) · Finding · GS1 Digital Link.

Bounded contexts: BC1 Accreditation, BC2 Origin Certification (core), BC3 Chain of Custody (core), BC4 Unit Sealing (cortável), BC5 Alerts, BC6 Public Verification (read-only, dono do `VerdictPolicy`), SK GS1 shared kernel, ACL Solana.

## Invariantes-chave
- `Gtin`: 8/12/13/14 dígitos → normaliza para 14; check digit mod-10. `Gtin.create("2001234567893")` → `02001234567893`.
- Lote único por `(gtin, lot)` (`BATCH_ALREADY_CERTIFIED`); expiry futuro no registro; só o emissor original retira o certificado.
- Custódia — matriz role×evento (spec 01 §4.3 C3) validada na escrita; na leitura, violações viram `Finding`, não exceção (qualquer um pode postar memo).
- CNPJ nunca on-chain: só `LegalIdHash` (SHA-256 dos dígitos).
- `VerdictPolicy` R1–R8 avaliadas em ordem; memo de não-credenciado é descartado da trilha mas não muda o veredito sozinho. Um teste unitário por regra.

## UI / API pública
- Rotas: `/`, `/scan`, `/01/[gtin]/10/[lot]`, `/01/[gtin]/10/[lot]/21/[serial]`, `/api/verify`, `/api/seal/...json`, `/audit/[batchKey]`. `/api/verify` segue exatamente o contrato JSON de `specs/05` (teste zod); nunca 404 para lote desconhecido; `s-maxage=15`; 30 req/min/IP.
- Mobile-first, veredito visível sem rolar. **Inglês por padrão, `?lang=pt` para português** (decisão do usuário, mudou em relação ao spec 05). Cor nunca é o único sinal (ícone + palavra).
- Sem termos cripto na tela do paciente (wallet, NFT, token, attestation) — só em `/audit`.
- Vermelho `#c1121f` **somente** em NOT_RECOGNIZED. Tokens: ink `#003049`, paper `#fdf0d5`, ok `#669bbc`, warn `#e0a100`, bad `#c1121f`, bad-deep `#780000`, muted `#3d5a6c`. Fontes: Space Grotesk + IBM Plex Sans.
- Metas: Lighthouse a11y ≥ 95, contraste ≥ 4.5:1, p95 de verify < 2 s.

## Skills (`.claude/skills/`, copiadas de `SKILLS/agent/skills/`)
Invoque a skill quando a tarefa casar:

| Skill | Use para |
|---|---|
| `mastering-typescript` | Tipos, Result/erros, Zod, vitest, config strict em `domain`/`application`/`infra-solana`/`cli` |
| `software-architecture` | C4 + ADRs; registrar decisões (ex.: pin do kit, "sem programa próprio") |
| `design-pattern-review` | Revisar hexagonal/ports e padrões antes de congelar o código |
| `plantuml-odt` | Re-renderizar `diagrams/*.puml` e gerar documento ODT |
| `react-best-practices` | Next.js/React performance em `apps/web` (server components, p95 < 2 s) |
| `next-dev-loop` | Verificar em runtime as páginas de veredito após editar `apps/web` |
| `shadcn` · `ui-styling` | Componentes e Tailwind das telas de veredito e `/audit` |
| `ui-ux-pro-max` · `design-system` | Telas mobile-first, tokens de paleta/tipografia |
| `wcag-2.2` | Auditoria de acessibilidade (meta Lighthouse ≥ 95) |
| `slides` | Deck do pitch (Arena) |

Não aplicáveis a este projeto (não copiadas): axum, rust-skills, python, brand, banner-design, next-cache-*/partial-prefetching.

## Plano e testes
Cronograma, spikes S1–S3, demo script e limitações conhecidas: `specs/06-delivery-plan.md`. Camadas de teste: domínio (vitest, tabelas de VO, role×evento, R1–R8) · aplicação (fakes em memória, Given/When/Then de `specs/04`) · adapters (devnet, `describe.skipIf(!process.env.RPC_URL)`) · E2E (`cph demo:seed && cph verify`) · perf (20 chamadas sequenciais a `/api/verify`).

Ao implementar um use case ou tela, leia primeiro o spec correspondente (`01` domínio, `02` on-chain, `03` arquitetura, `04` use cases, `05` verificação/UI) e atenda seus critérios de aceite.

## Design system
Mock mobile aprovado pelo usuário: `design/fidelidade.webp` (telas de veredito seguem este desenho). Telas validadas (paciente + manager) em `design/screens/` e `design/screens/manager/`; o CSS delas virou `apps/web/src/styles/`. Referência de tokens: `design/design-system.html` (paleta, tipografia, três telas de veredito, regras e tokens `--cph-*`). Publicado em https://claude.ai/artifact/C3rN4ktK6ZkLVR8YXk7hCD. `certapharm-diagramas.html` já usa a mesma paleta. Ao construir `apps/web`, siga este arquivo; em caso de conflito, vale `specs/05-verification-api-ui.md`.
