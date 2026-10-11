import { z } from "zod";

/** Spec 05 section 2. `/api/verify` must return exactly this shape. */
export const verifyResponseSchema = z.strictObject({
  verdict: z.enum(["AUTHENTIC", "AUTHENTIC_WITH_ALERT", "NOT_RECOGNIZED"]),
  findings: z.array(z.strictObject({ code: z.string(), severity: z.enum(["info", "warning", "critical"]), message: z.string() })),
  query: z.strictObject({ gtin: z.string().length(14), lot: z.string().min(1), serial: z.string().min(1).optional() }),
  batch: z.strictObject({
    batchKey: z.string().min(32),
    productName: z.string(),
    dosage: z.string(),
    expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    country: z.string().length(2),
    issuer: z.strictObject({ wallet: z.string(), displayName: z.string().optional(), role: z.string().optional() }),
    certificate: z.strictObject({ attestation: z.string(), explorerUrl: z.url() }).optional(),
  }).optional(),
  alert: z.strictObject({
    level: z.enum(["RECALL", "SUSPECTED_COUNTERFEIT", "COLD_CHAIN_BREACH", "REGULATOR_NOTICE"]),
    reasonCode: z.string(),
    publicNote: z.string(),
  }).optional(),
  trail: z.array(z.strictObject({
    type: z.enum(["SHIPPED", "RECEIVED", "STORED", "DISPENSED"]),
    actor: z.strictObject({ displayName: z.string().optional(), role: z.string().optional() }),
    at: z.iso.datetime(),
    temperatureC: z.number().nullable(),
    signature: z.string(),
    explorerUrl: z.url(),
  })),
  unit: z.strictObject({
    serial: z.string(),
    seal: z.enum(["SEALED", "REVOKED", "NOT_FOUND", "NOT_CHECKED"]),
    assetId: z.string().optional(),
  }).optional(),
  checkedAt: z.iso.datetime(),
  cluster: z.string(),
});
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;
