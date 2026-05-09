import type { AuditInput, AuditLogEvent, EmitLog, LegalReport } from "../../interfaces";
import type { LegalAnalyzer } from "./LegalAnalyzer";
import { summarizeCodeIntent } from "./codeIntentSummarizer";
import { LegalKnowledgeProvider } from "./legalKnowledgeProvider";

export class MockLegalAnalyzer implements LegalAnalyzer {
  private readonly knowledgeProvider = new LegalKnowledgeProvider();

  async run(input: AuditInput, emit: EmitLog): Promise<LegalReport> {
    emit(event(input.auditId, "legal_analysis", "info", "Summarizing user contract intent"));
    await delay(250);

    const intent = summarizeCodeIntent(input.sourceCode, input.readmeText, input.commentsText);
    const hasAdmin = intent.adminSignals.length > 0 || intent.adminFunctions.length > 0;
    const claimsNoAdmin = intent.declaredClaims.some((claim) =>
      ["no admin", "no owner", "fully decentralized", "trustless"].includes(claim),
    );

    emit(event(input.auditId, "legal_scrape", "info", "Loading mock MiCA and ESMA legal knowledge"));
    await delay(250);
    const legalKnowledge = this.knowledgeProvider.loadLegalKnowledge();
    const legalSources = this.knowledgeProvider.toLegalSources(legalKnowledge);

    emit(event(input.auditId, "legal_analysis", "info", "Comparing stated intent against code behavior"));
    await delay(250);

    const mismatch = hasAdmin && claimsNoAdmin;

    const report: LegalReport = {
      riskLevel: mismatch ? "medium" : "low",
      score: mismatch ? 72 : 91,
      x402PaymentTxHash: mockHash(`${input.auditId}:x402`),
      apifyRunId: `mock-apify-${input.auditId}`,
      sources: legalSources,
      intentSummary: intent.summary,
      codeIntentMismatch: mismatch
        ? [
            {
              claim: "No admin or fully decentralized control",
              observedCodeBehavior: "The contract appears to expose owner/admin-controlled behavior.",
              severity: "medium",
              line: findFirstLine(input.sourceCode, /\bonlyOwner\b|\bowner\b|\badmin\b/i),
            },
          ]
        : [],
      regulatoryFindings: [
        {
          title: "Regulatory classification requires product-level review",
          summary:
            `The mock analyzer found no automatic MiCA blocker across ${legalKnowledge.length} legal knowledge record(s), but user-facing claims should stay aligned with actual admin and custody behavior.`,
          riskLevel: mismatch ? "medium" : "low",
          sourceUrl:
            "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica",
        },
      ],
      exploitNewsFindings: [],
      sentimentSummary: `Mock legal sentiment is stable. Intent classifier labeled this as ${intent.likelyProtocolType}.`,
    };

    emit(event(input.auditId, "legal_analysis", "success", "Mock legal analyzer produced LegalReport", {
      riskLevel: report.riskLevel,
      score: report.score,
      mismatches: report.codeIntentMismatch.length,
    }));

    return report;
  }
}

function findFirstLine(sourceCode: string, pattern: RegExp): number | undefined {
  const lines = sourceCode.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : undefined;
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

function mockHash(seed: string): `0x${string}` {
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
