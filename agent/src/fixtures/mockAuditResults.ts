import type { AuditResult } from "../interfaces";

const baseAuditResult = {
  selectedFilePath: "contracts/demo/SafeVault.sol",
  codeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  reportHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  reportUri: "local://preflight-audits/demo-safe-vault.json",
  totalScore: 91,
  legalReport: {
    riskLevel: "low",
    score: 93,
    sources: [],
    intentSummary: "README claims match the audited privileged access model.",
    codeIntentMismatch: [],
    regulatoryFindings: [],
    exploitNewsFindings: [],
    sentimentSummary: "No elevated market sentiment risk found.",
  },
  securityReport: {
    score: 90,
    maxSimilarityPercent: 74,
    closestMatches: [],
    findings: [],
    storageLayoutFindings: [],
    astSummary: "No critical AST-level issues in the mock result.",
    llmSecuritySummary: "Mock audit result is eligible for certification.",
  },
  createdAt: "2026-05-08T00:00:00.000Z",
} satisfies Omit<AuditResult, "auditId" | "certificationEligible" | "blockingReasons">;

export const eligibleMockAuditResult: AuditResult = {
  ...baseAuditResult,
  auditId: "mock-audit-eligible",
  certificationEligible: true,
  blockingReasons: [],
};

export const blockedMockAuditResult: AuditResult = {
  ...baseAuditResult,
  auditId: "mock-audit-blocked",
  totalScore: 41,
  certificationEligible: false,
  blockingReasons: ["Critical proxy storage collision risk"],
  securityReport: {
    ...baseAuditResult.securityReport,
    score: 35,
    findings: [
      {
        id: "mock-critical-proxy-collision",
        severity: "critical",
        title: "Critical proxy storage collision risk",
        description: "The mock fixture represents a blocking proxy storage collision.",
        filePath: "contracts/demo/UnsafeVault.sol",
        lineStart: 42,
        lineEnd: 48,
        evidence: "Mock fixture evidence for adjacent proxy ownership and implementation slots.",
        recommendation: "Add storage gaps and verify storage layout before certification.",
      },
    ],
    llmSecuritySummary: "Mock audit result is blocked from certification.",
  },
};
