import type { LegalFinding, LegalReport, LegalSource, RiskLevel, Severity } from "../../interfaces";
import type { CodeIntentSummary } from "./codeIntentSummarizer";
import type { LegalKnowledgeRecord } from "./legalKnowledgeProvider";
import { buildLegalCollisionPrompt, buildSourceExcerpt, LEGAL_COLLISION_SYSTEM_PROMPT } from "./prompts";

export interface LegalCollisionAnalyzerInput {
  auditId: string;
  sourceCode: string;
  intent: CodeIntentSummary;
  legalKnowledge: LegalKnowledgeRecord[];
  legalSources: LegalSource[];
  readmeText?: string;
  commentsText?: string;
  x402PaymentTxHash?: string;
  apifyRunId?: string;
}

export interface LegalCollisionAnalyzerOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
}

interface LegalCollisionJson {
  riskLevel: RiskLevel;
  score: number;
  intentSummary: string;
  codeIntentMismatch: Array<{
    claim: string;
    observedCodeBehavior: string;
    severity: Severity;
    line?: number;
  }>;
  regulatoryFindings: LegalFinding[];
  exploitNewsFindings: LegalFinding[];
  sentimentSummary: string;
}

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;
const RISK_LEVELS = ["low", "medium", "high"] as const;
const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export class LegalCollisionAnalyzer {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: LegalCollisionAnalyzerOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.endpoint = options.endpoint ?? process.env.OPENAI_CHAT_COMPLETIONS_URL ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async analyze(input: LegalCollisionAnalyzerInput): Promise<LegalReport> {
    const localReport = buildDeterministicLegalReport(input);

    if (!this.apiKey) {
      return localReport;
    }

    try {
      const llmJson = await this.callOpenAi(input);
      const validated = validateLegalCollisionJson(llmJson, input);

      return {
        ...localReport,
        ...validated,
        sources: input.legalSources,
        x402PaymentTxHash: input.x402PaymentTxHash,
        apifyRunId: input.apifyRunId,
      };
    } catch {
      return {
        ...localReport,
        sentimentSummary: `${localReport.sentimentSummary} OpenAI analysis was unavailable, so deterministic local analysis was used.`,
      };
    }
  }

  private async callOpenAi(input: LegalCollisionAnalyzerInput): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: legalReportResponseFormat(),
          messages: [
            {
              role: "system",
              content: LEGAL_COLLISION_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildLegalCollisionPrompt({
                intent: input.intent,
                legalKnowledge: input.legalKnowledge,
                commentsText: `${input.readmeText ?? ""}\n${input.commentsText ?? ""}`,
                sourceExcerpt: buildSourceExcerpt(input.sourceCode),
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI legal collision request failed with HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI legal collision response was empty");
      }

      return JSON.parse(content);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildDeterministicLegalReport(input: LegalCollisionAnalyzerInput): LegalReport {
  const hasAdmin = input.intent.adminSignals.length > 0 || input.intent.adminFunctions.length > 0;
  const hasCustody = input.intent.assetCustodySignals.length > 0;
  const hasUpgradeability = input.intent.upgradeabilitySignals.length > 0;
  const claimsNoAdmin = hasClaim(input.intent.declaredClaims, ["no admin", "no owner", "fully decentralized", "trustless"]);
  const claimsNonCustodial = hasClaim(input.intent.declaredClaims, ["non-custodial", "non custodial", "no custody"]);
  const mismatches: LegalCollisionJson["codeIntentMismatch"] = [];

  if (hasAdmin && claimsNoAdmin) {
    mismatches.push({
      claim: "No admin, no owner, trustless, or fully decentralized control",
      observedCodeBehavior: "The Solidity source contains owner/admin control signals or admin-like functions.",
      severity: "medium",
      line: findFirstLine(input.sourceCode, /\bonlyOwner\b|\bonlyRole\b|\bowner\b|\badmin\b|\bgovernance\b/i),
    });
  }

  if (hasCustody && claimsNonCustodial) {
    mismatches.push({
      claim: "Non-custodial or no custody behavior",
      observedCodeBehavior: "The Solidity source includes deposit, withdraw, transfer, token, vault, or balance handling signals.",
      severity: "medium",
      line: findFirstLine(input.sourceCode, /\bdeposit\b|\bwithdraw\b|\btransfer\b|\btoken\b|\bvault\b|\bbalanceOf\b/i),
    });
  }

  if (hasUpgradeability && input.intent.declaredClaims.includes("immutable")) {
    mismatches.push({
      claim: "Immutable contract behavior",
      observedCodeBehavior: "The Solidity source includes upgradeability, proxy, initializer, implementation, or delegatecall signals.",
      severity: "medium",
      line: findFirstLine(input.sourceCode, /\bupgrade\b|\bproxy\b|\bimplementation\b|\bdelegatecall\b|\binitializer\b/i),
    });
  }

  const riskLevel = inferRiskLevel(mismatches.length, hasCustody, hasUpgradeability);
  const score = Math.max(35, 94 - mismatches.length * 14 - (hasCustody ? 5 : 0) - (hasUpgradeability ? 6 : 0));
  const primarySource = input.legalSources[0]?.url ?? "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica";

  return {
    riskLevel,
    score,
    x402PaymentTxHash: input.x402PaymentTxHash,
    apifyRunId: input.apifyRunId,
    sources: input.legalSources,
    intentSummary: input.intent.summary,
    codeIntentMismatch: mismatches,
    regulatoryFindings: [
      {
        title: hasCustody ? "Asset handling requires claims and disclosure review" : "No automatic legal blocker detected",
        summary: hasCustody
          ? `The contract is classified as ${input.intent.likelyProtocolType} and appears to handle assets. User-facing claims should be checked against MiCA/ESMA context and actual custody/admin behavior.`
          : `The contract is classified as ${input.intent.likelyProtocolType}. No deterministic regulatory blocker was detected from the compact legal knowledge set.`,
        riskLevel,
        sourceUrl: primarySource,
      },
    ],
    exploitNewsFindings: [],
    sentimentSummary: `Deterministic legal collision analysis used ${input.legalKnowledge.length} compact legal knowledge record(s).`,
  };
}

function validateLegalCollisionJson(value: unknown, input: LegalCollisionAnalyzerInput): LegalCollisionJson {
  if (!isRecord(value)) {
    throw new Error("LLM legal collision output is not an object");
  }

  const riskLevel = parseRiskLevel(value.riskLevel);
  const score = parseScore(value.score);
  const intentSummary = parseString(value.intentSummary, input.intent.summary);
  const codeIntentMismatch = parseMismatches(value.codeIntentMismatch);
  const regulatoryFindings = parseFindings(value.regulatoryFindings, input.legalSources);
  const exploitNewsFindings = parseFindings(value.exploitNewsFindings, input.legalSources);
  const sentimentSummary = parseString(value.sentimentSummary, "LLM legal collision analysis completed.");

  return {
    riskLevel,
    score,
    intentSummary,
    codeIntentMismatch,
    regulatoryFindings,
    exploitNewsFindings,
    sentimentSummary,
  };
}

function legalReportResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "legal_collision_report",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "riskLevel",
          "score",
          "intentSummary",
          "codeIntentMismatch",
          "regulatoryFindings",
          "exploitNewsFindings",
          "sentimentSummary",
        ],
        properties: {
          riskLevel: { type: "string", enum: [...RISK_LEVELS] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          intentSummary: { type: "string" },
          codeIntentMismatch: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim", "observedCodeBehavior", "severity", "line"],
              properties: {
                claim: { type: "string" },
                observedCodeBehavior: { type: "string" },
                severity: { type: "string", enum: [...SEVERITIES] },
                line: { type: ["integer", "null"], minimum: 1 },
              },
            },
          },
          regulatoryFindings: findingsSchema(),
          exploitNewsFindings: findingsSchema(),
          sentimentSummary: { type: "string" },
        },
      },
    },
  };
}

function findingsSchema() {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "riskLevel", "sourceUrl"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        riskLevel: { type: "string", enum: [...RISK_LEVELS] },
        sourceUrl: { type: "string" },
      },
    },
  };
}

function parseMismatches(value: unknown): LegalCollisionJson["codeIntentMismatch"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      claim: parseString(item.claim, "Unspecified claim"),
      observedCodeBehavior: parseString(item.observedCodeBehavior, "Unspecified observed behavior"),
      severity: parseSeverity(item.severity),
      line: typeof item.line === "number" && item.line > 0 ? Math.floor(item.line) : undefined,
    }))
    .slice(0, 6);
}

function parseFindings(value: unknown, legalSources: LegalSource[]): LegalFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sourceUrls = new Set(legalSources.map((source) => source.url));
  const fallbackUrl = legalSources[0]?.url ?? "https://www.esma.europa.eu/";

  return value
    .filter(isRecord)
    .map((item) => {
      const sourceUrl = parseString(item.sourceUrl, fallbackUrl);

      return {
        title: parseString(item.title, "Regulatory review item"),
        summary: parseString(item.summary, "Review user-facing claims against code behavior."),
        riskLevel: parseRiskLevel(item.riskLevel),
        sourceUrl: sourceUrls.has(sourceUrl) ? sourceUrl : fallbackUrl,
      };
    })
    .slice(0, 6);
}

function parseRiskLevel(value: unknown): RiskLevel {
  return RISK_LEVELS.includes(value as RiskLevel) ? (value as RiskLevel) : "medium";
}

function parseSeverity(value: unknown): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : "medium";
}

function parseScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 70;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 900) : fallback;
}

function inferRiskLevel(mismatchCount: number, hasCustody: boolean, hasUpgradeability: boolean): RiskLevel {
  if (mismatchCount >= 2 || (mismatchCount >= 1 && hasCustody && hasUpgradeability)) {
    return "high";
  }

  if (mismatchCount >= 1 || hasCustody || hasUpgradeability) {
    return "medium";
  }

  return "low";
}

function hasClaim(claims: string[], targets: string[]): boolean {
  return claims.some((claim) => targets.includes(claim));
}

function findFirstLine(sourceCode: string, pattern: RegExp): number | undefined {
  const lines = sourceCode.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && pattern.test(line);
  });
  return index >= 0 ? index + 1 : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
