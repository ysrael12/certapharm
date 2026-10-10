# Spikes (devnet)

| Spike | Result | Evidence |
|---|---|---|
| S1 SAS end to end | Passed. Schema `version` is 1. Attestation data round-trips. `memcmp` offset 65 matches the `schema` field (1 hit). | credential `4N1XSTM9pzUg5Ck9tbAvBPMfHhyvTMPXs9wdRgMcbNYT5S6FKHABD6nLFTe8knUj6JAR8GumsbZXBHf81nVXYHdb`, schema `48484d42thKQcZw2qCybjiXyLbrG1Zak3VBeTGAMDLmPw4QMH7byUVnWhGhuSHMc13t4r1YxPSmAqND9YPuwHVD5`, attestation `931BU2RRAEgA34wQqsJrQwHsrtwqELzx2c6mELTqAy4wNRUirEFU2LkkK2oQnzA9FsVqDi98858FnFfHyMv8NAg` |
| S2 Memo plus reference key | Passed. The tx appears in `getSignaturesForAddress(batchKey)`; no `custody_index` fallback needed. | `2aqHm2NK4H37TBo2S93R1f8Cxp3SevEMcpERu8en2LN9A6pMbwcoXvsWL9H1M1h2PGKLV7U6wbRP8R2c5Cq6gQH4` |
| S3 Bubblegum V2 plus DAS | Pending (script runs; result not yet recorded). | `spikes/s3-bubblegum.ts` |

Findings: `@solana-program/system` does not work with kit 5.5 (`program-client-core` export missing), so the
0-lamport transfer is built by hand: program `1111…`, data `[2,0,0,0, 0×8]`, accounts source (writable signer),
destination (writable), batchKey (readonly).
