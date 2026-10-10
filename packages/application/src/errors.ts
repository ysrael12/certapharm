import { err, type DomainError, type Result } from "@certapharm/domain";

/** Failure of an adapter (RPC, chain, filesystem). Only adapters throw; use cases convert with `guard`. */
export interface InfraError {
  readonly kind: "infra";
  readonly code: string;
  readonly message: string;
}
export type AppError = DomainError | InfraError;

export const infraError = (code: string, message: string): InfraError => ({ kind: "infra", code, message });

/** Runs an adapter call and turns a thrown exception into an `InfraError` value. */
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T, InfraError>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return err(infraError("INFRA_FAILURE", e instanceof Error ? e.message : String(e)));
  }
}
