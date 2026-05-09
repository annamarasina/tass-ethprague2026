import type { AuditInput, AuditLogEvent, EmitLog, LegalReport } from "../../interfaces";
import type { LegalAnalyzer } from "./LegalAnalyzer";
import { summarizeCodeIntent } from "./codeIntentSummarizer";
import { LegalCollisionAnalyzer } from "./legalCollisionAnalyzer";
import { SwarmKnowledgeProvider } from "./swarmKnowledgeProvider";

export class MockLegalAnalyzer implements LegalAnalyzer {
  private readonly knowledgeProvider = new SwarmKnowledgeProvider();
  private readonly collisionAnalyzer = new LegalCollisionAnalyzer();

  async run(input: AuditInput, emit: EmitLog): Promise<LegalReport> {
    emit(event(input.auditId, "legal_analysis", "info", "Summarizing user contract intent"));
    await delay(250);

    const intent = summarizeCodeIntent(input.sourceCode, input.readmeText, input.commentsText);

    emit(event(input.auditId, "legal_scrape", "info", "Loading MiCA and ESMA legal knowledge"));
    await delay(250);
    const knowledgeResult = await this.knowledgeProvider.loadLegalKnowledge();
    if (knowledgeResult.source === "swarm") {
      emit(event(input.auditId, "swarm_fetch", "success", "Verified legal knowledge loaded from Swarm", {
        swarmHash: knowledgeResult.swarmHash,
        gatewayUrl: knowledgeResult.gatewayUrl,
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
      x402PaymentTxHash: mockHash(`${input.auditId}:x402`),
      apifyRunId: `mock-apify-${input.auditId}`,
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
