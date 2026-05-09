import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAddress, type Address } from "viem";
import type { AuditLogEvent, EmitLog, RegistryVerificationResult } from "../../interfaces";

type SourcifyStatus = RegistryVerificationResult["sourcifyStatus"];

interface SourcifyVerifierOptions {
  apiBaseUrl?: string;
  chainId?: number;
  registryAddress?: Address;
  sourcePath?: string;
  contractIdentifier?: string;
  compilerVersion?: string;
  creationTransactionHash?: string;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}

interface SourcifyVerifyTicket {
  verificationId?: string;
  error?: unknown;
  message?: string;
}

interface SourcifyJobResult {
  verificationId?: string;
  status?: string;
  match?: string;
  creationMatch?: string;
  runtimeMatch?: string;
  error?: unknown;
  message?: string;
  result?: SourcifyJobResult;
}

const DEFAULT_API_BASE_URL = "https://sourcify.dev/server";
const DEFAULT_CHAIN_ID = 84532;
const DEFAULT_SOURCE_PATH = "contracts/src/AuditRegistry.sol";
const DEFAULT_CONTRACT_IDENTIFIER = "src/AuditRegistry.sol:AuditRegistry";
const DEFAULT_COMPILER_VERSION = "0.8.24+commit.e11b9ed9";
const DEFAULT_MAX_POLL_ATTEMPTS = 20;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

export class SourcifyVerifier {
  private readonly apiBaseUrl: string;
  private readonly chainId: number;
  private readonly registryAddress: Address;
  private readonly sourcePath: string;
  private readonly contractIdentifier: string;
  private readonly compilerVersion: string;
  private readonly creationTransactionHash?: string;
  private readonly maxPollAttempts: number;
  private readonly pollIntervalMs: number;

  constructor(options: SourcifyVerifierOptions = {}) {
    this.apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? process.env.SOURCIFY_API_BASE ?? DEFAULT_API_BASE_URL);
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    this.registryAddress = getAddress(options.registryAddress ?? requiredEnv("AUDIT_REGISTRY_ADDRESS"));
    this.sourcePath = options.sourcePath ?? DEFAULT_SOURCE_PATH;
    this.contractIdentifier = options.contractIdentifier ?? DEFAULT_CONTRACT_IDENTIFIER;
    this.compilerVersion = options.compilerVersion ?? process.env.AUDIT_REGISTRY_COMPILER_VERSION ?? DEFAULT_COMPILER_VERSION;
    this.creationTransactionHash = options.creationTransactionHash ?? process.env.AUDIT_REGISTRY_CREATION_TX_HASH;
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async verify(emit: EmitLog): Promise<RegistryVerificationResult> {
    emit(this.event("verify", "info", "Submitting AuditRegistry source to Sourcify"));

    const requestBody = this.buildVerifyRequestBody();
    const ticketResponse = await fetch(`${this.apiBaseUrl}/v2/verify/${this.chainId}/${this.registryAddress}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const ticket = (await ticketResponse.json().catch(() => ({}))) as SourcifyVerifyTicket;

    if (!ticketResponse.ok || !ticket.verificationId) {
      return this.failureResult(`Sourcify verification submission failed: ${formatSourcifyError(ticket)}`, emit);
    }

    emit(
      this.event("verify", "info", "Sourcify verification job created", {
        verificationId: ticket.verificationId,
      }),
    );

    const jobResult = await this.pollVerificationJob(ticket.verificationId, emit);
    const sourcifyStatus = mapSourcifyStatus(jobResult);
    const sourcifyUrl = this.sourcifyUrl();

    emit(
      this.event(
        "verify",
        sourcifyStatus === "failed" ? "error" : "success",
        sourcifyStatus === "failed" ? "Sourcify verification failed" : "Sourcify verification complete",
        {
          verificationId: ticket.verificationId,
          sourcifyStatus,
          sourcifyUrl,
          rawStatus: jobResult.status,
          match: jobResult.match,
          creationMatch: jobResult.creationMatch,
          runtimeMatch: jobResult.runtimeMatch,
          error: jobResult.error,
        },
      ),
    );

    return {
      registryAddress: this.registryAddress,
      chainId: this.chainId,
      sourcifyStatus,
      sourcifyUrl: sourcifyStatus === "failed" ? undefined : sourcifyUrl,
      error: sourcifyStatus === "failed" ? formatSourcifyError(jobResult) : undefined,
    };
  }

  private buildVerifyRequestBody(): Record<string, unknown> {
    const sourceContent = readSource(this.sourcePath);
    const body: Record<string, unknown> = {
      stdJsonInput: {
        language: "Solidity",
        sources: {
          "src/AuditRegistry.sol": {
            content: sourceContent,
          },
        },
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            "*": {
              "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
            },
          },
        },
      },
      compilerVersion: this.compilerVersion,
      contractIdentifier: this.contractIdentifier,
    };

    if (this.creationTransactionHash) {
      body.creationTransactionHash = this.creationTransactionHash;
    }

    return body;
  }

  private async pollVerificationJob(verificationId: string, emit: EmitLog): Promise<SourcifyJobResult> {
    let lastResult: SourcifyJobResult = {};

    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      await sleep(this.pollIntervalMs);

      const response = await fetch(`${this.apiBaseUrl}/v2/verify/${verificationId}`);
      lastResult = (await response.json().catch(() => ({}))) as SourcifyJobResult;
      const result = normalizeJobResult(lastResult);

      emit(
        this.event("verify", "info", "Polling Sourcify verification job", {
          verificationId,
          attempt,
          status: result.status,
          match: result.match,
        }),
      );

      if (isTerminalJob(result)) {
        return result;
      }

      lastResult = result;
    }

    return {
      ...normalizeJobResult(lastResult),
      status: "timeout",
      error: `Timed out after ${this.maxPollAttempts} Sourcify polling attempts`,
    };
  }

  private failureResult(error: string, emit: EmitLog): RegistryVerificationResult {
    emit(this.event("verify", "error", error));

    return {
      registryAddress: this.registryAddress,
      chainId: this.chainId,
      sourcifyStatus: "failed",
      error,
    };
  }

  private sourcifyUrl(): string {
    return `https://repo.sourcify.dev/contracts/full_match/${this.chainId}/${this.registryAddress}`;
  }

  private event(
    phase: AuditLogEvent["phase"],
    level: AuditLogEvent["level"],
    message: string,
    data?: Record<string, unknown>,
  ): AuditLogEvent {
    return {
      auditId: "registry-verification",
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
      data,
    };
  }
}

function normalizeJobResult(result: SourcifyJobResult): SourcifyJobResult {
  return result.result ?? result;
}

function isTerminalJob(result: SourcifyJobResult): boolean {
  const status = result.status?.toLowerCase();
  return Boolean(result.match || result.creationMatch || result.runtimeMatch || result.error || status === "verified" || status === "failed");
}

function mapSourcifyStatus(result: SourcifyJobResult): SourcifyStatus {
  const normalized = normalizeJobResult(result);
  const values = [normalized.status, normalized.match, normalized.creationMatch, normalized.runtimeMatch]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (values.some((value) => value.includes("exact_match") || value === "perfect" || value === "verified")) {
    return "verified";
  }

  if (values.some((value) => value === "match" || value === "partial")) {
    return "partial";
  }

  return "failed";
}

function readSource(sourcePath: string): string {
  const candidatePaths = [
    resolve(process.cwd(), sourcePath),
    resolve(process.cwd(), "..", sourcePath),
    resolve(process.cwd(), "contracts", "src", "AuditRegistry.sol"),
  ];

  const existingPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));

  if (!existingPath) {
    throw new Error(`Unable to find AuditRegistry source at ${sourcePath}`);
  }

  return readFileSync(existingPath, "utf8");
}

function formatSourcifyError(value: unknown): string {
  if (!value) {
    return "Unknown Sourcify error";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }

  if (typeof value === "object" && "error" in value) {
    return formatSourcifyError(value.error);
  }

  return JSON.stringify(value);
}

function requiredEnv(variableName: string): string {
  const value = process.env[variableName];
  if (!value) {
    throw new Error(`Missing required Sourcify config: ${variableName}`);
  }

  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

