import { err } from "./result.js";

export interface DomainError {
  readonly kind: "domain";
  readonly code: string;
  readonly message: string;
}
export const domainError = (code: string, message: string): DomainError => ({ kind: "domain", code, message });
export const fail = (code: string, message: string) => err(domainError(code, message));
