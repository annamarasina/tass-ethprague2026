import { blockedMockAuditResult, eligibleMockAuditResult } from "../fixtures/mockAuditResults";
import type { AuditLogEvent, EmitLog } from "../interfaces";
import { CertificationBlockedError } from "../tools/certification/CertificationService";
import { MockCertificationService } from "../tools/certification/MockCertificationService";
import { RegistryCertificationService } from "../tools/certification/RegistryCertificationService";
import type { CertificationService } from "../tools/certification";

const mode = process.argv.includes("--live") ? "live" : "mock";

const emit: EmitLog = (event: AuditLogEvent) => {
  const data = event.data ? ` ${JSON.stringify(event.data)}` : "";
  console.log(`[${event.timestamp}] ${event.level.toUpperCase()} ${event.phase}: ${event.message}${data}`);
};

async function main(): Promise<void> {
  const service = createCertificationService();

  console.log(`Backend 3 demo mode: ${mode}`);
  console.log("Step 1: registry verification");
  const verificationResult = await service.verifyRegistry(emit);
  console.log(JSON.stringify(verificationResult, null, 2));

  console.log("Step 2: eligible audit certificate issuance");
  const certificateResult = await service.issueCertificate(eligibleMockAuditResult, emit);
  console.log(JSON.stringify(certificateResult, null, 2));

  console.log("Step 3: blocked audit certificate issuance");
  try {
    await service.issueCertificate(blockedMockAuditResult, emit);
    throw new Error("Blocked audit unexpectedly minted a certificate");
  } catch (error) {
    if (!(error instanceof CertificationBlockedError)) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          blocked: true,
          auditId: error.auditId,
          blockingReasons: error.blockingReasons,
        },
        null,
        2,
      ),
    );
  }

  console.log("Backend 3 demo flow complete");
}

function createCertificationService(): CertificationService {
  if (mode === "live") {
    return new RegistryCertificationService();
  }

  return new MockCertificationService({
    now: () => new Date("2026-05-08T00:00:00.000Z"),
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

