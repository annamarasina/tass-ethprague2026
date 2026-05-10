import { createHash } from "node:crypto";
import type { AuditInput, AuditLogEvent, AuditResult, EmitLog, Hex, SecurityReport } from "./interfaces";
import { MockLegalAnalyzer } from "./tools/legal";

const legalAnalyzer = new MockLegalAnalyzer();

export async function runAudit(input: AuditInput, emit: EmitLog): Promise<AuditResult> {
  emit(event(input.auditId, "init", "info", "Local agent received selected Solidity file", {
    selectedFilePath: input.selectedFilePath,
  }));

  const legalReport = await legalAnalyzer.run(input, emit);
  const securityReport = await runMockSecurityAnalysis(input, emit);
  const blockingReasons = collectBlockingReasons(legalReport.codeIntentMismatch, securityReport);
  const totalScore = Math.round(legalReport.score * 0.38 + securityReport.score * 0.62);
  const reportSeed = JSON.stringify({
    auditId: input.auditId,
    selectedFilePath: input.selectedFilePath,
    legalReport,
    securityReport,
    totalScore,
  });

  const auditResult: AuditResult = {
    auditId: input.auditId,
    selectedFilePath: input.selectedFilePath,
    codeHash: sha256Hex(input.sourceCode),
    reportHash: sha256Hex(reportSeed),
    reportUri: `local://preflight-audits/${input.auditId}.json`,
    totalScore,
    legalReport,
    securityReport,
    complianceSuggestions: toComplianceSuggestions(legalReport),
    certificationEligible: blockingReasons.length === 0,
    blockingReasons,
    createdAt: new Date().toISOString(),
  };

  emit(event(input.auditId, "report", auditResult.certificationEligible ? "success" : "warn", "Local agent audit report generated", {
    totalScore,
    certificationEligible: auditResult.certificationEligible,
    blockingReasons,
  }));

  return auditResult;
}

function toComplianceSuggestions(legalReport: AuditResult["legalReport"]): AuditResult["complianceSuggestions"] {
  const suggestions: AuditResult["complianceSuggestions"] = [];

  for (const mismatch of legalReport.codeIntentMismatch) {
    suggestions.push({
      title: "Resolve code/intent mismatch",
      description: `${mismatch.claim} Observed behavior: ${mismatch.observedCodeBehavior}`,
      regulation: "Contract disclosure and governance consistency",
      severity: mismatch.severity,
    });
  }

  for (const finding of legalReport.regulatoryFindings) {
    suggestions.push({
      title: finding.title,
      description: finding.summary,
      regulation: finding.sourceUrl,
      severity: finding.riskLevel,
    });
  }

  return suggestions;
}

async function runMockSecurityAnalysis(input: AuditInput, emit: EmitLog): Promise<SecurityReport> {
  emit(event(input.auditId, "security_parse", "info", "Parsing Solidity surface for demo security signals"));
  await delay(140);

  const source = input.sourceCode;
  const hasDelegateCall = /\bdelegatecall\b/i.test(source);
  const hasUpgradeability = /\b(upgrade|proxy|implementation|initializer|__gap)\b/i.test(source);
  const hasOwner = /\b(onlyOwner|owner|admin|onlyRole)\b/i.test(source);
  const hasAssetHandling = /\b(deposit|withdraw|transferFrom|transfer|payable|vault|token)\b/i.test(source);
  const critical = hasDelegateCall && hasUpgradeability && hasOwner;
  const findings: SecurityReport["findings"] = [];

  emit(event(input.auditId, "security_similarity", "info", "Running Sourcify similarity review"));
  await delay(140);

  if (critical) {
    findings.push({
      id: "critical-upgradeable-delegatecall",
      severity: "critical",
      title: "Upgradeable delegatecall path with privileged control",
      description: "The security review found delegatecall, upgradeability, and privileged control signals together.",
      filePath: input.selectedFilePath,
      lineStart: findFirstLine(source, /\bdelegatecall\b|\bupgrade\w*\b|\bimplementation\b|\bonlyOwner\b/i) ?? 1,
      evidence: "delegatecall/upgradeability and owner/admin signals appeared in the selected Solidity file.",
      recommendation: "Run the Backend 2 Sourcify storage-layout diff and remove or strongly constrain privileged upgrade paths before certification.",
    });
  } else if (hasUpgradeability || hasOwner) {
    findings.push({
      id: "privileged-control-review",
      severity: "medium",
      title: "Privileged or upgradeable control requires review",
      description: "The security review found owner/admin or upgradeability-shaped controls.",
      filePath: input.selectedFilePath,
      lineStart: findFirstLine(source, /\bonlyOwner\b|\bonlyRole\b|\bowner\b|\badmin\b|\bupgrade\w*\b|\bproxy\b/i) ?? 1,
      evidence: "Owner/admin or upgradeability keywords appeared in the selected Solidity file.",
      recommendation: "Document the privileged role, add a timelock, or replace direct control with governance before final review.",
    });
  }

  emit(event(input.auditId, "security_storage", hasUpgradeability ? "warn" : "info", "Storage-layout review completed"));
  await delay(140);

  const score = Math.max(30, 93 - (critical ? 45 : 0) - (hasUpgradeability ? 10 : 0) - (hasOwner ? 7 : 0) - (hasAssetHandling ? 4 : 0));
  const maxSimilarityPercent = critical ? 88 : hasUpgradeability ? 61 : hasAssetHandling ? 42 : 24;

  emit(event(input.auditId, "security_analysis", critical ? "error" : "success", "Security analysis complete", {
    score,
    maxSimilarityPercent,
    findings: findings.length,
  }));

  return {
    score,
    maxSimilarityPercent,
    closestMatches: [
      {
        contractName: critical ? "KnownExploitUpgradeableVault" : "CuratedReferenceContract",
        source: "local_curated_index",
        similarityPercent: maxSimilarityPercent,
        label: critical ? "known_exploit" : "blue_chip",
        metadataUrl: "local://curated-sourcify-index",
      },
    ],
    findings,
    storageLayoutFindings: hasUpgradeability
      ? [
          {
            title: "Upgradeable storage layout requires Backend 2 diff",
            severity: critical ? "critical" : "medium",
            description: "Storage review detected proxy or upgradeability indicators.",
          },
        ]
      : [],
    astSummary: "Security analysis inspected ownership, upgradeability, delegatecall, and asset-handling signals.",
    llmSecuritySummary: "Sourcify similarity and storage-layout diffing can replace the local security review through the same AuditResult shape.",
  };
}

function collectBlockingReasons(
  mismatches: AuditResult["legalReport"]["codeIntentMismatch"],
  securityReport: SecurityReport,
): string[] {
  const reasons = new Set<string>();

  for (const finding of securityReport.findings) {
    if (finding.severity === "critical") {
      reasons.add(finding.title);
    }
  }

  for (const mismatch of mismatches) {
    if (mismatch.severity === "critical" || mismatch.severity === "high") {
      reasons.add(`Legal intent mismatch: ${mismatch.claim}`);
    }
  }

  return [...reasons];
}

function event(
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

function sha256Hex(value: string): Hex {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function findFirstLine(sourceCode: string, pattern: RegExp): number | undefined {
  const lines = sourceCode.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && pattern.test(line);
  });
  return index >= 0 ? index + 1 : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
