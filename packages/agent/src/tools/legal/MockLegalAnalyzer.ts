import type { AuditInput, AuditLogEvent, EmitLog, LegalReport } from "../../interfaces";
import type { LegalAnalyzer } from "./LegalAnalyzer";
import { ApifyX402LegalProvider } from "./apifyX402LegalProvider";
import { summarizeCodeIntent } from "./codeIntentSummarizer";
import { LegalCollisionAnalyzer } from "./legalCollisionAnalyzer";
import { buildSourceExcerpt } from "./prompts";

export class MockLegalAnalyzer implements LegalAnalyzer {
  private readonly knowledgeProvider = new ApifyX402LegalProvider();
  private readonly collisionAnalyzer = new LegalCollisionAnalyzer();

  async run(input: AuditInput, emit: EmitLog): Promise<LegalReport> {
    emit(event(input.auditId, "legal_analysis", "info", "Summarizing user contract intent"));
    await delay(250);

    const intent = summarizeCodeIntent(input.sourceCode, input.readmeText, input.commentsText);

    emit(event(input.auditId, "legal_scrape", "info", "Loading MiCA and ESMA legal knowledge"));
    await delay(250);
    const knowledgeResult = await this.knowledgeProvider.loadLegalKnowledge(
      {
        auditId: input.auditId,
        intent,
        sourceExcerpt: buildSourceExcerpt(input.sourceCode, 2_000),
      },
      emit,
    );
    if (knowledgeResult.source === "apify") {
      emit(event(input.auditId, "legal_scrape", "success", "Apify legal actor returned legal knowledge", {
        apifyRunId: knowledgeResult.apifyRunId,
        records: knowledgeResult.records.length,
      }));
    } else if (knowledgeResult.fallbackSource === "swarm") {
      emit(event(input.auditId, "swarm_fetch", "success", "Verified legal knowledge loaded from Swarm", {
        records: knowledgeResult.records.length,
      }));
    } else {
      emit(event(input.auditId, "swarm_fetch", "warn", "Using local legal knowledge fallback", {
        reason: knowledgeResult.warning,
        records: knowledgeResult.records.length,
      }));
    }
    const legalKnowledge = knowledgeResult.records;
    const legalSources = this.knowledgeProvider.toLegalSources(legalKnowledge);

    emit(event(input.auditId, "legal_analysis", "info", "Comparing stated intent against code behavior"));
    await delay(250);

    const report = await this.collisionAnalyzer.analyze({
      auditId: input.auditId,
      sourceCode: input.sourceCode,
      intent,
      legalKnowledge,
      legalSources,
      readmeText: input.readmeText,
      commentsText: input.commentsText,
      x402PaymentTxHash: knowledgeResult.x402PaymentTxHash,
      apifyRunId: knowledgeResult.apifyRunId,
    });

    emit(event(input.auditId, "legal_analysis", "success", "Legal collision analyzer produced LegalReport", {
      riskLevel: report.riskLevel,
      score: report.score,
      mismatches: report.codeIntentMismatch.length,
    }));

    return report;
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
