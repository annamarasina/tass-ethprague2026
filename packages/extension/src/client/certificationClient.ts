import { createInterface } from "node:readline";
import type { AuditLogEvent, AuditResult, CertificateResult, Hex } from "../types";
import type { AgentProcessManager } from "./processManager";

type EmitCertificationLog = (event: AuditLogEvent) => void;

type AgentCertificationResponse =
  | { type: "log"; event: AuditLogEvent }
  | { type: "certificate"; certificateResult: CertificateResult }
  | { type: "error"; message: string };

export class CertificationBlockedError extends Error {
  constructor(readonly auditId: string, readonly blockingReasons: string[]) {
    super(`Audit ${auditId} is not eligible for certification: ${blockingReasons.join("; ")}`);
    this.name = "CertificationBlockedError";
  }
}

export class MockCertificationClient {
  async issueCertificate(auditResult: AuditResult, emit: EmitCertificationLog): Promise<CertificateResult> {
    await this.emitPhase(auditResult.auditId, emit, "mint", "info", "Preparing certificate transaction");

    if (!auditResult.certificationEligible) {
      await this.emitPhase(auditResult.auditId, emit, "mint", "error", "Certification blocked by audit findings", {
        blockingReasons: auditResult.blockingReasons,
      });
      throw new CertificationBlockedError(auditResult.auditId, auditResult.blockingReasons);
    }

    await this.emitPhase(auditResult.auditId, emit, "mint", "info", "Submitting issueCertificate transaction");
    await this.emitPhase(auditResult.auditId, emit, "verify", "info", "Checking Sourcify registry verification");

    const transactionHash = mockHex(`${auditResult.auditId}:tx:${auditResult.codeHash}`);
    const certificateHash = mockHex(`${auditResult.auditId}:certificate:${auditResult.reportUri}`);

    await this.emitPhase(auditResult.auditId, emit, "mint", "success", "Certificate minted", {
      transactionHash,
      certificateHash,
    });

    return {
      auditId: auditResult.auditId,
      registryAddress: "0x1000000000000000000000000000000000000001",
      transactionHash,
      certificateHash,
      baseScanUrl: `https://sepolia.etherscan.io/tx/${transactionHash}`,
      reportUri: auditResult.reportUri,
      sourcifyUrl: "https://repo.sourcify.dev/contracts/full_match/11155111/0x1000000000000000000000000000000000000001",
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

export class AgentCertificationClient {
  constructor(private readonly processManager: AgentProcessManager) {}

  async issueCertificate(auditResult: AuditResult, emit: EmitCertificationLog): Promise<CertificateResult> {
    if (process.env.PREFLIGHT_CERTIFICATION_MODE !== "live") {
      emit(localCertificationLog(auditResult.auditId, "mint", "warn", "Using local certificate path. Set PREFLIGHT_CERTIFICATION_MODE=live for Ethereum Sepolia minting."));
      return new MockCertificationClient().issueCertificate(auditResult, emit);
    }

    if (!this.processManager.isAvailable()) {
      emit(localCertificationLog(auditResult.auditId, "mint", "warn", "Local agent entrypoint unavailable; using local certificate path."));
      return new MockCertificationClient().issueCertificate(auditResult, emit);
    }

    const child = this.processManager.start();

    return new Promise<CertificateResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for Ethereum Sepolia certificate mint result"));
      }, 120_000);

      const lineReader = createInterface({ input: child.stdout });

      const cleanup = (): void => {
        clearTimeout(timeout);
        lineReader.close();
      };

      lineReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }

        try {
          const response = parseAgentCertificationResponse(line);

          if (response.type === "log") {
            emit(response.event);
            return;
          }

          if (response.type === "error") {
            cleanup();
            reject(new Error(response.message));
            return;
          }

          cleanup();
          resolve(response.certificateResult);
        } catch {
          // Ignore non-JSON process output from shared long-lived agent logs.
        }
      });

      lineReader.on("error", (error) => {
        cleanup();
        reject(error);
      });

      child.stdin.write(`${JSON.stringify({ type: "issueCertificate", auditResult })}\n`);
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

function parseAgentCertificationResponse(line: string): AgentCertificationResponse {
  const parsed = JSON.parse(line) as AgentCertificationResponse;

  if (parsed.type !== "log" && parsed.type !== "certificate" && parsed.type !== "error") {
    throw new Error(`Unknown agent response type: ${(parsed as { type?: string }).type ?? "missing"}`);
  }

  return parsed;
}

function localCertificationLog(
  auditId: string,
  phase: AuditLogEvent["phase"],
  level: AuditLogEvent["level"],
  message: string,
): AuditLogEvent {
  return {
    auditId,
    timestamp: new Date().toISOString(),
    phase,
    level,
    message,
  };
}
