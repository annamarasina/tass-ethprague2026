import type { AuditInput, AuditLogEvent, EmitLog, LegalReport } from "../../interfaces";
import type { LegalAnalyzer } from "./LegalAnalyzer";
import { ApifyX402LegalProvider } from "./apifyX402LegalProvider";
import { classifyComplianceCategory } from "./complianceCategoryClassifier";
import { summarizeCodeIntent } from "./codeIntentSummarizer";
import { LegalCollisionAnalyzer } from "./legalCollisionAnalyzer";
import type { LegalKnowledgeRecord } from "./legalKnowledgeProvider";
import { normalizeLegalKnowledgeRecords } from "./legalKnowledgeProvider";
import { buildSourceExcerpt } from "./prompts";
import { RegulationScraperRunner } from "./regulationScraperRunner";
import { SwarmRegulationStore } from "./swarmRegulationStore";

export class MockLegalAnalyzer implements LegalAnalyzer {
  private readonly apifyFallbackProvider = new ApifyX402LegalProvider();
  private readonly collisionAnalyzer = new LegalCollisionAnalyzer();
  private readonly scraperRunner = new RegulationScraperRunner();
  private readonly swarmStore = new SwarmRegulationStore();

  async run(input: AuditInput, emit: EmitLog): Promise<LegalReport> {
    // ── Step 1: AI agent reads Solidity code and summarizes intent ──
    emit(event(input.auditId, "legal_analysis", "info", "AI agent reading Solidity code and summarizing intent"));
    await delay(250);

    const intent = summarizeCodeIntent(input.sourceCode, input.readmeText, input.commentsText);

    emit(event(input.auditId, "compliance_classify", "success", "Contract intent classified", {
      contractNames: intent.contractNames,
      likelyProtocolType: intent.likelyProtocolType,
      summary: intent.summary,
      adminSignals: intent.adminSignals,
      assetCustodySignals: intent.assetCustodySignals,
      upgradeabilitySignals: intent.upgradeabilitySignals,
      declaredClaims: intent.declaredClaims,
    }));

    // ── Step 2: AI agent classifies the compliance category ──
    const categoryResult = classifyComplianceCategory(input.sourceCode, intent);

    emit(event(input.auditId, "compliance_classify", "success",
      `AI agent classified contract as "${categoryResult.category}" (confidence: ${categoryResult.confidence})`, {
      contractNames: intent.contractNames,
      likelyProtocolType: intent.likelyProtocolType,
      summary: intent.summary,
      adminSignals: intent.adminSignals,
      assetCustodySignals: intent.assetCustodySignals,
      upgradeabilitySignals: intent.upgradeabilitySignals,
      declaredClaims: intent.declaredClaims,
      category: categoryResult.category,
      confidence: categoryResult.confidence,
      reasoning: categoryResult.reasoning,
      searchQueries: categoryResult.searchQueries,
    }));

    // ── Step 3: AI agent calls the corresponding regulation scraper ──
    emit(event(input.auditId, "compliance_payment", "success", "Agent payment path prepared for compliance actor workflow", {
      network: process.env.X402_NETWORK ?? "sepolia",
      asset: process.env.X402_ASSET ?? "USDC",
      mode: process.env.APIFY_PROVIDER_MODE === "mcp-x402" ? "enforced" : "authorized",
      providerMode: process.env.APIFY_PROVIDER_MODE ?? "token",
      actorId: categoryResult.category,
      category: categoryResult.category,
      paymentTxHash: process.env.X402_PAYMENT_REFERENCE,
    }));

    emit(event(input.auditId, "compliance_scrape", "info",
      `AI agent invoking ${categoryResult.category} regulation scraper via MCP`, {
      category: categoryResult.category,
      actorId: categoryResult.category,
      caller: "agent",
    }));
    await delay(250);

    let legalKnowledge: LegalKnowledgeRecord[] = [];
    let scraperSource: "scraper" | "apify" | "swarm" | "local" = "local";
    let x402PaymentTxHash: string | undefined;
    let apifyRunId: string | undefined;

    try {
      const scraperResult = await this.scraperRunner.runForCategory(
        categoryResult.category,
        input.auditId,
        emit,
      );

      if (scraperResult.records.length > 0) {
        legalKnowledge = normalizeLegalKnowledgeRecords(scraperResult.records);
        scraperSource = "scraper";

        emit(event(input.auditId, "compliance_scrape", "success",
          `Regulation scraper returned ${legalKnowledge.length} records for "${categoryResult.category}"`, {
          category: categoryResult.category,
          scraperName: scraperResult.scraperName,
          records: legalKnowledge.length,
          scrapedAt: scraperResult.scrapedAt,
        }));

        // ── Step 4: Store fresh regulations in Swarm database with timestamp ──
        emit(event(input.auditId, "swarm_fetch", "info",
          "Uploading fresh regulations to Swarm database with timestamp"));

        const uploadResult = await this.swarmStore.uploadRegulations(
          categoryResult.category,
          scraperResult.records,
          scraperResult.scrapedAt,
          input.auditId,
          emit,
        );

        if (uploadResult) {
          emit(event(input.auditId, "swarm_fetch", "success",
            `Regulations stored in Swarm: ${uploadResult.swarmHash}`, {
            swarmHash: uploadResult.swarmHash,
            recordCount: uploadResult.recordCount,
            gateway: uploadResult.gatewayUrl,
          }));
        }
      } else {
        emit(event(input.auditId, "compliance_scrape", "warn",
          "Regulation scraper returned no records, falling back to Apify/Swarm chain", {
          category: categoryResult.category,
        }));
        throw new Error("Scraper returned no records");
      }
    } catch {
      // ── Fallback: Apify → Swarm → Local (existing pipeline) ──
      emit(event(input.auditId, "legal_scrape", "info",
        "Falling back to Apify/Swarm legal knowledge chain"));

      const knowledgeResult = await this.apifyFallbackProvider.loadLegalKnowledge(
        {
          auditId: input.auditId,
          intent,
          sourceExcerpt: buildSourceExcerpt(input.sourceCode, 2_000),
        },
        emit,
      );

      legalKnowledge = knowledgeResult.records;
      x402PaymentTxHash = knowledgeResult.x402PaymentTxHash;
      apifyRunId = knowledgeResult.apifyRunId;

      if (knowledgeResult.source === "apify") {
        scraperSource = "apify";
        emit(event(input.auditId, "compliance_scrape", "success", "Apify fallback returned legal knowledge", {
          apifyRunId: knowledgeResult.apifyRunId,
          records: knowledgeResult.records.length,
        }));
      } else if (knowledgeResult.fallbackSource === "swarm") {
        scraperSource = "swarm";
        emit(event(input.auditId, "swarm_fetch", "success", "Swarm fallback loaded legal knowledge", {
          records: knowledgeResult.records.length,
        }));
      } else {
        scraperSource = "local";
        emit(event(input.auditId, "swarm_fetch", "warn", "Using local legal knowledge fallback", {
          reason: knowledgeResult.warning,
          records: knowledgeResult.records.length,
        }));
      }
    }

    const legalSources = this.apifyFallbackProvider.toLegalSources(legalKnowledge);

    emit(event(input.auditId, "compliance_sources", "success", "Compliance sources prepared for LLM review", {
      count: legalSources.length,
      source: scraperSource,
      category: categoryResult.category,
      sources: legalSources.slice(0, 8).map((source) => ({
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        fetchedAt: source.fetchedAt,
      })),
    }));

    // ── Step 5: LLM collision analysis ──
    emit(event(input.auditId, "legal_analysis", "info", "Comparing stated intent against code behavior"));
    emit(event(input.auditId, "compliance_analysis", "info",
      `Running LLM compliance analysis for "${categoryResult.category}" contract`, {
      sourceCount: legalSources.length,
      category: categoryResult.category,
      likelyProtocolType: intent.likelyProtocolType,
    }));
    await delay(250);

    const report = await this.collisionAnalyzer.analyze({
      auditId: input.auditId,
      sourceCode: input.sourceCode,
      intent,
      legalKnowledge,
      legalSources,
      readmeText: input.readmeText,
      commentsText: input.commentsText,
      x402PaymentTxHash,
      apifyRunId,
    });

    emit(event(input.auditId, "legal_analysis", "success", "Legal collision analyzer produced LegalReport", {
      riskLevel: report.riskLevel,
      score: report.score,
      mismatches: report.codeIntentMismatch.length,
    }));
    emit(event(input.auditId, "compliance_output", "success", "LLM compliance report generated", {
      riskLevel: report.riskLevel,
      score: report.score,
      category: categoryResult.category,
      confidence: categoryResult.confidence,
      scraperSource,
      intentSummary: report.intentSummary,
      mismatches: report.codeIntentMismatch,
      regulatoryFindings: report.regulatoryFindings,
      sentimentSummary: report.sentimentSummary,
      x402PaymentTxHash: report.x402PaymentTxHash,
      apifyRunId: report.apifyRunId,
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
