import type { AuditLogEvent, AuditResult, CertificateResult, Hex } from "../types";

type EmitCertificationLog = (event: AuditLogEvent) => void;

export class CertificationBlockedError extends Error {
  constructor(readonly auditId: string, readonly blockingReasons: string[]) {
    super(`Audit ${auditId} is not eligible for certification: ${blockingReasons.join("; ")}`);
    this.name = "CertificationBlockedError";
  }
}

export class MockCertificationClient {
  async issueCertificate(auditResult: AuditResult, emit: EmitCertificationLog): Promise<CertificateResult> {
    await this.emitPhase(auditResult.auditId, emit, "mint", "info", "Preparing mock certificate transaction");

    if (!auditResult.certificationEligible) {
      await this.emitPhase(auditResult.auditId, emit, "mint", "error", "Certification blocked by audit findings", {
        blockingReasons: auditResult.blockingReasons,
      });
      throw new CertificationBlockedError(auditResult.auditId, auditResult.blockingReasons);
    }

    await this.emitPhase(auditResult.auditId, emit, "mint", "info", "Submitting mock issueCertificate transaction");
    await this.emitPhase(auditResult.auditId, emit, "verify", "info", "Checking Sourcify registry verification");

    const transactionHash = mockHex(`${auditResult.auditId}:tx:${auditResult.codeHash}`);
    const certificateHash = mockHex(`${auditResult.auditId}:certificate:${auditResult.reportUri}`);

    await this.emitPhase(auditResult.auditId, emit, "mint", "success", "Mock certificate minted", {
      transactionHash,
      certificateHash,
    });

    return {
      auditId: auditResult.auditId,
      registryAddress: "0x1000000000000000000000000000000000000001",
      transactionHash,
      certificateHash,
      baseScanUrl: `https://sepolia.basescan.org/tx/${transactionHash}`,
      reportUri: auditResult.reportUri,
      sourcifyUrl: "https://repo.sourcify.dev/contracts/full_match/84532/0x1000000000000000000000000000000000000001",
    };
  }

  private async emitPhase(
    auditId: string,
    emit: EmitCertificationLog,
    phase: AuditLogEvent["phase"],
    level: AuditLogEvent["level"],
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await delay(420);
    emit({
      auditId,
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
      data,
    });
  }
}

function mockHex(seed: string): Hex {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const chunk = (hash >>> 0).toString(16).padStart(8, "0");
  return `0x${chunk.repeat(8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

