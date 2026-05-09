import type { AuditResult, CertificateResult, EmitLog, RegistryVerificationResult } from "../../interfaces";

export interface CertificationService {
  verifyRegistry(emit: EmitLog): Promise<RegistryVerificationResult>;

  issueCertificate(auditResult: AuditResult, emit: EmitLog): Promise<CertificateResult>;
}

export class CertificationBlockedError extends Error {
  constructor(readonly auditId: string, readonly blockingReasons: string[]) {
    super(`Audit ${auditId} is not eligible for certification: ${blockingReasons.join("; ")}`);
    this.name = "CertificationBlockedError";
  }
}

