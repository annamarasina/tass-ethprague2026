import type { AuditInput, AuditLogEvent, AuditResult, SecurityFinding } from "../types";

type EmitAuditLog = (event: AuditLogEvent) => void;

export class MockAuditClient {
  async runAudit(input: AuditInput, emit: EmitAuditLog): Promise<AuditResult> {
    await this.emitPhase(input.auditId, emit, "init", "info", "Reading selected Solidity file");
    await this.emitPhase(input.auditId, emit, "legal_payment", "info", "Mock x402 payment prepared for Apify actor", {
      network: "base-sepolia",
      asset: "USDC",
    });
    await this.emitPhase(input.auditId, emit, "legal_scrape", "info", "Fetched recent exploit and regulatory sources");
    await this.emitPhase(input.auditId, emit, "legal_analysis", "success", "Legal intent risk scored");
    await this.emitPhase(input.auditId, emit, "security_parse", "info", "Parsed Solidity AST");
    await this.emitPhase(input.auditId, emit, "security_similarity", "info", "Compared against Sourcify exploit patterns");
    await this.emitPhase(input.auditId, emit, "security_storage", "warn", "Storage layout review found upgradeability signals");
    await this.emitPhase(input.auditId, emit, "security_analysis", "success", "Security analysis complete");

    const result = this.buildResult(input);

    await this.emitPhase(
      input.auditId,
      emit,
      "report",
      result.certificationEligible ? "success" : "warn",
      result.certificationEligible ? "Eligible mock audit report generated" : "Blocked mock audit report generated",
    );

    return result;
  }

  private buildResult(input: AuditInput): AuditResult {
    const blocked = shouldReturnBlockedResult(input);
    const criticalFinding: SecurityFinding = {
      id: "mock-critical-proxy-collision",
      title: "Critical proxy storage collision risk",
      severity: "critical",
      description: "The contract uses upgradeable-style storage without a reserved gap, matching a recent exploit pattern.",
      filePath: input.selectedFilePath,
      lineStart: 42,
      lineEnd: 48,
      evidence: "Detected implementation slot and owner slot adjacency in mock AST/storage summary.",
      recommendation: "Add explicit storage gaps and validate proxy storage layout before deployment.",
    };
    const mediumFinding: SecurityFinding = {
      id: "mock-owner-privilege",
      title: "Privileged owner function requires disclosure",
      severity: "medium",
      description: "README claims limited admin control, but the contract exposes an owner-only configuration path.",
      filePath: input.selectedFilePath,
      lineStart: 24,
      lineEnd: 29,
      evidence: "Mock parser found onlyOwner modifier on updateFee().",
      recommendation: "Document the admin role or replace it with timelocked governance.",
    };
    const findings = blocked ? [criticalFinding, mediumFinding] : [mediumFinding];

    return {
      auditId: input.auditId,
      selectedFilePath: input.selectedFilePath,
      codeHash: mockHex(`${input.sourceCode}:code`),
      reportHash: mockHex(`${input.auditId}:report`),
      reportUri: `local://preflight-audits/${input.auditId}.json`,
      totalScore: blocked ? 47 : 88,
      legalReport: {
        riskLevel: blocked ? "medium" : "low",
        score: blocked ? 68 : 91,
        x402PaymentTxHash: mockHex(`${input.auditId}:x402`),
        apifyRunId: `mock-apify-${input.auditId}`,
        sources: [
          {
            title: "Recent exploit intelligence digest",
            url: "https://rekt.news/",
            sourceType: "rekt",
            fetchedAt: input.timestamp,
            summary: "Recent exploit reports were scanned for contract-level danger patterns.",
          },
          {
            title: "MiCA crypto compliance watch",
            url: "https://www.esma.europa.eu/",
            sourceType: "mica",
            fetchedAt: input.timestamp,
            summary: "No immediate regulatory blocker found for the mocked contract intent.",
          },
        ],
        intentSummary: "Mock analysis compares README intent against privileged functions in the selected contract.",
        codeIntentMismatch: [
          {
            claim: "No admin controls",
            observedCodeBehavior: "Owner-only configuration path exists.",
            severity: blocked ? "high" : "medium",
            line: 24,
          },
        ],
        regulatoryFindings: [],
        exploitNewsFindings: [
          {
            title: "Upgradeable storage pattern resembles recent exploit family",
            summary: "Mock exploit intelligence flagged storage layout as the primary pattern to review.",
            riskLevel: blocked ? "high" : "medium",
            sourceUrl: "https://rekt.news/",
          },
        ],
        sentimentSummary: "Mock sentiment data shows normal developer concern around upgradeability and admin controls.",
      },
      securityReport: {
        score: blocked ? 39 : 86,
        maxSimilarityPercent: blocked ? 82 : 34,
        closestMatches: [
          {
            contractName: blocked ? "MockExploitVault" : "OpenZeppelin ERC20",
            address: "0x1000000000000000000000000000000000000001",
            chainId: 1,
            source: blocked ? "local_curated_index" : "sourcify",
            similarityPercent: blocked ? 82 : 34,
            label: blocked ? "known_exploit" : "blue_chip",
            metadataUrl: "https://repo.sourcify.dev/",
          },
        ],
        findings,
        storageLayoutFindings: [
          {
            title: "Upgradeable storage layout needs review",
            severity: blocked ? "critical" : "medium",
            description: "Mock storage diff found a risky slot pattern around ownership and implementation state.",
            affectedSlot: "0x00",
            referenceContract: blocked ? "MockExploitVault" : "OpenZeppelin proxy pattern",
          },
        ],
        astSummary: "Mock AST analyzer found owner modifiers, external calls, and upgradeability-shaped state.",
        llmSecuritySummary: blocked
          ? "The selected contract is too similar to a known exploit pattern to certify."
          : "The selected contract has admin disclosure issues but no critical blocker in the mock path.",
      },
      certificationEligible: !blocked,
      blockingReasons: blocked ? [criticalFinding.title] : [],
      createdAt: input.timestamp,
    };
  }

  private async emitPhase(
    auditId: string,
    emit: EmitAuditLog,
    phase: AuditLogEvent["phase"],
    level: AuditLogEvent["level"],
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await delay(360);
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

function shouldReturnBlockedResult(input: AuditInput): boolean {
  const haystack = `${input.selectedFilePath}\n${input.sourceCode}`.toLowerCase();
  return haystack.includes("unsafe") || haystack.includes("critical") || haystack.includes("collision");
}

function mockHex(seed: string): `0x${string}` {
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

