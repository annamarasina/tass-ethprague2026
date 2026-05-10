import type {
  AuditLogEvent,
  AuditResult,
  CertificateResult,
  EmitLog,
  Hex,
  RegistryVerificationResult,
} from "../../interfaces";
import { CertificationBlockedError, type CertificationService } from "./CertificationService";

const DEFAULT_CHAIN_ID = 11155111;
const DEFAULT_REGISTRY_ADDRESS = "0x1000000000000000000000000000000000000001" as Hex;
const DEFAULT_EXPLORER_BASE_URL = "https://sepolia.etherscan.io";
const DEFAULT_SOURCIFY_BASE_URL = "https://repo.sourcify.dev/contracts/full_match";

export interface MockCertificationServiceOptions {
  registryAddress?: Hex;
  chainId?: number;
  explorerBaseUrl?: string;
  sourcifyBaseUrl?: string;
  now?: () => Date;
}

export class MockCertificationService implements CertificationService {
  private readonly registryAddress: Hex;
  private readonly chainId: number;
  private readonly explorerBaseUrl: string;
  private readonly sourcifyBaseUrl: string;
  private readonly now: () => Date;

  constructor(options: MockCertificationServiceOptions = {}) {
    this.registryAddress = options.registryAddress ?? DEFAULT_REGISTRY_ADDRESS;
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    this.explorerBaseUrl = trimTrailingSlash(options.explorerBaseUrl ?? DEFAULT_EXPLORER_BASE_URL);
    this.sourcifyBaseUrl = trimTrailingSlash(options.sourcifyBaseUrl ?? DEFAULT_SOURCIFY_BASE_URL);
    this.now = options.now ?? (() => new Date());
  }

  async verifyRegistry(emit: EmitLog): Promise<RegistryVerificationResult> {
    emit(this.event("local-verification", "verify", "info", "Checking Sourcify registry verification"));

    const sourcifyUrl = `${this.sourcifyBaseUrl}/${this.chainId}/${this.registryAddress}`;

    emit(this.event("local-verification", "verify", "success", "Registry verification complete", { sourcifyUrl }));

    return {
      registryAddress: this.registryAddress,
      chainId: this.chainId,
      sourcifyStatus: "verified",
      sourcifyUrl,
    };
  }

  async issueCertificate(auditResult: AuditResult, emit: EmitLog): Promise<CertificateResult> {
    emit(this.event(auditResult.auditId, "mint", "info", "Preparing certificate transaction"));

    if (!auditResult.certificationEligible) {
      emit(
        this.event(auditResult.auditId, "mint", "error", "Certification blocked by audit findings", {
          blockingReasons: auditResult.blockingReasons,
        }),
      );
      throw new CertificationBlockedError(auditResult.auditId, auditResult.blockingReasons);
    }

    const transactionHash = this.mockHash(`${auditResult.auditId}:tx:${auditResult.codeHash}`);
    const certificateHash = this.mockHash(
      `${auditResult.auditId}:certificate:${auditResult.codeHash}:${auditResult.totalScore}:${auditResult.reportUri}`,
    );

    const result: CertificateResult = {
      auditId: auditResult.auditId,
      registryAddress: this.registryAddress,
      transactionHash,
      certificateHash,
      baseScanUrl: `${this.explorerBaseUrl}/tx/${transactionHash}`,
      reportUri: auditResult.reportUri,
    };

    emit(
      this.event(auditResult.auditId, "mint", "success", "Certificate issued", {
        registryAddress: result.registryAddress,
        transactionHash: result.transactionHash,
        certificateHash: result.certificateHash,
        baseScanUrl: result.baseScanUrl,
      }),
    );

    return result;
  }

  private event(
    auditId: string,
    phase: AuditLogEvent["phase"],
    level: AuditLogEvent["level"],
    message: string,
    data?: Record<string, unknown>,
  ): AuditLogEvent {
    return {
      auditId,
      timestamp: this.now().toISOString(),
      phase,
      level,
      message,
      data,
    };
  }

  private mockHash(seed: string): Hex {
    let hash = 0x811c9dc5;

    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }

    const chunk = (hash >>> 0).toString(16).padStart(8, "0");
    return `0x${chunk.repeat(8)}` as Hex;
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
