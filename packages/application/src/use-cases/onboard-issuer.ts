import { Participant, fail, ok, type Result } from "@certapharm/domain";
import { guard, type AppError } from "../errors.js";
import type { AccreditationRegistry, IssuerCredential, IssuerOnboarding, SignerRef } from "../ports/index.js";

/** UC3: an accredited MANUFACTURER or IMPORTER gets its own credential and `batch` schema. Idempotent. */
export class OnboardIssuer {
  constructor(
    private readonly accreditation: AccreditationRegistry,
    private readonly onboarding: IssuerOnboarding,
  ) {}

  async execute(input: { issuer: SignerRef }): Promise<Result<IssuerCredential, AppError>> {
    const acc = await guard(() => this.accreditation.find(input.issuer.address));
    if (!acc.ok) return acc;
    if (!Participant.canIssueCertificates(acc.value ?? undefined)) {
      return fail("NOT_AN_ISSUER", "Only an accredited MANUFACTURER or IMPORTER can issue certificates");
    }
    const credential = await guard(() => this.onboarding.ensureIssuerCredential(input.issuer));
    return credential.ok ? ok(credential.value) : credential;
  }
}
