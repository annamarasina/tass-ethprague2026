import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseEventLogs,
  type Address,
  type Chain,
  type Hex,
  type Log,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { AuditLogEvent, AuditResult, CertificateResult, EmitLog, RegistryVerificationResult } from "../../interfaces";
import { CertificationBlockedError, type CertificationService } from "./CertificationService";
import { auditRegistryAbi } from "./abi/AuditRegistry";

interface RegistryCertificationServiceOptions {
  rpcUrl?: string;
  privateKey?: Hex;
  registryAddress?: Address;
  baseScanBaseUrl?: string;
  subjectAddress?: Address;
  chain?: Chain;
}

const DEFAULT_BASESCAN_BASE_URL = "https://sepolia.basescan.org";

export class MissingCertificationConfigError extends Error {
  constructor(variableName: string) {
    super(`Missing required certification config: ${variableName}`);
    this.name = "MissingCertificationConfigError";
  }
}

export class RegistryCertificationService implements CertificationService {
  private readonly rpcUrl: string;
  private readonly privateKey: Hex;
  private readonly registryAddress: Address;
  private readonly baseScanBaseUrl: string;
  private readonly subjectAddress?: Address;
  private readonly chain: Chain;
  private readonly account: PrivateKeyAccount;

  constructor(options: RegistryCertificationServiceOptions = {}) {
    this.rpcUrl = options.rpcUrl ?? requiredEnv("BASE_SEPOLIA_RPC_URL");
    this.privateKey = normalizePrivateKey(options.privateKey ?? requiredEnv("AGENT_PRIVATE_KEY", "PRIVATE_KEY"));
    this.registryAddress = getAddress(options.registryAddress ?? requiredEnv("AUDIT_REGISTRY_ADDRESS"));
    this.baseScanBaseUrl = trimTrailingSlash(options.baseScanBaseUrl ?? process.env.BASESCAN_BASE_URL ?? DEFAULT_BASESCAN_BASE_URL);
    this.subjectAddress = options.subjectAddress ? getAddress(options.subjectAddress) : undefined;
    this.chain = options.chain ?? baseSepolia;
    this.account = privateKeyToAccount(this.privateKey);
  }

  async verifyRegistry(emit: EmitLog): Promise<RegistryVerificationResult> {
    emit(this.event("registry-verification", "verify", "warn", "Live Sourcify verification is implemented in Phase 5"));

    return {
      registryAddress: this.registryAddress,
      chainId: this.chain.id,
      sourcifyStatus: "failed",
      error: "Sourcify verification is not implemented until Phase 5",
    };
  }

  async issueCertificate(auditResult: AuditResult, emit: EmitLog): Promise<CertificateResult> {
    emit(this.event(auditResult.auditId, "mint", "info", "Preparing registry certificate transaction"));

    if (!auditResult.certificationEligible) {
      emit(
        this.event(auditResult.auditId, "mint", "error", "Certification blocked by audit findings", {
          blockingReasons: auditResult.blockingReasons,
        }),
      );
      throw new CertificationBlockedError(auditResult.auditId, auditResult.blockingReasons);
    }

    const publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
    const walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    const subject = this.subjectAddress ?? this.account.address;

    emit(
      this.event(auditResult.auditId, "mint", "info", "Submitting issueCertificate transaction", {
        registryAddress: this.registryAddress,
        subject,
        codeHash: auditResult.codeHash,
        totalScore: auditResult.totalScore,
      }),
    );

    const transactionHash = await walletClient.writeContract({
      address: this.registryAddress,
      abi: auditRegistryAbi,
      functionName: "issueCertificate",
      args: [subject, auditResult.codeHash, BigInt(auditResult.totalScore), auditResult.reportUri],
    });

    emit(this.event(auditResult.auditId, "mint", "info", "Waiting for certificate transaction receipt", { transactionHash }));

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    const certificateHash = extractCertificateHash(receipt.logs) ?? auditResult.reportHash;

    emit(
      this.event(auditResult.auditId, "mint", "success", "Registry certificate issued", {
        transactionHash,
        certificateHash,
        blockNumber: receipt.blockNumber.toString(),
      }),
    );

    return {
      auditId: auditResult.auditId,
      registryAddress: this.registryAddress,
      transactionHash,
      certificateHash,
      baseScanUrl: `${this.baseScanBaseUrl}/tx/${transactionHash}`,
      reportUri: auditResult.reportUri,
    };
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
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
      data,
    };
  }
}

function extractCertificateHash(logs: Log[]): Hex | undefined {
  const parsedLogs = parseEventLogs({
    abi: auditRegistryAbi,
    eventName: "CertificateIssued",
    logs,
  });

  const [certificateIssued] = parsedLogs;
  return certificateIssued?.args.certificateHash;
}

function requiredEnv(...variableNames: string[]): string {
  for (const variableName of variableNames) {
    const value = process.env[variableName];
    if (value) {
      return value;
    }
  }

  throw new MissingCertificationConfigError(variableNames.join(" or "));
}

function normalizePrivateKey(value: string): Hex {
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Agent private key must be a 32-byte hex string");
  }

  return privateKey as Hex;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
