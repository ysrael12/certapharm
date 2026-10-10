/** Deterministic batch identity (a Solana address). Derived by the `BatchKeyDeriver` port, never in the domain. */
export type BatchKey = string & { readonly __brand: "BatchKey" };
