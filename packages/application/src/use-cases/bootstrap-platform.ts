import type { Result } from "@certapharm/domain";
import { guard, type InfraError } from "../errors.js";
import type { PlatformAddresses, PlatformSetup } from "../ports/index.js";

export type BootstrapPlatformOutput = PlatformAddresses & { readonly signatures: string[] };

/** UC1: idempotent creation of the Platform credential and the `participant` and `batch-alert` schemas. */
export class BootstrapPlatform {
  constructor(private readonly setup: PlatformSetup) {}

  execute(): Promise<Result<BootstrapPlatformOutput, InfraError>> {
    return guard(() => this.setup.ensure());
  }
}
