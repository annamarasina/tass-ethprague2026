import type { CodeIntentSummary } from "./codeIntentSummarizer";
import type { LegalKnowledgeRecord } from "./legalKnowledgeProvider";

export interface LegalCollisionPromptInput {
  intent: CodeIntentSummary;
  legalKnowledge: LegalKnowledgeRecord[];
  commentsText?: string;
  sourceExcerpt: string;
}

/*
Example legal-side flow:

Input:
- A Solidity file implements a stablecoin vault with deposit(), withdraw(), Ownable,
  and onlyOwner-controlled fund movement.
- README/comments claim "trustless", "non-custodial", or "no admin".
- Apify/Swarm returns compact MiCA/SEC/legal-news records about stablecoin custody,
  admin control, and user-facing disclosure risk.

The prompt should make the LLM compare:
1. Claimed intent: "non-custodial, no-admin stablecoin vault"
2. Observable code behavior: "contract holds USDC and owner can move funds"
3. Legal context: "custody/control over crypto-assets may require review"

Expected JSON-style output:
{
  "riskLevel": "high",
  "score": 42,
  "intentSummary": "The contract appears to custody stablecoin deposits with owner-controlled withdrawals.",
  "codeIntentMismatch": [
    {
      "claim": "No admin can move user funds",
      "observedCodeBehavior": "The withdraw function is restricted to onlyOwner and transfers stablecoins from the vault.",
      "severity": "high",
      "line": 9
    },
    {
      "claim": "Non-custodial vault",
      "observedCodeBehavior": "The contract receives and holds user stablecoin deposits.",
      "severity": "medium",
      "line": 5
    }
  ],
  "regulatoryFindings": [
    {
      "title": "Stablecoin custody claims require review",
      "summary": "The contract appears to handle stablecoin custody while making non-custodial or no-admin claims.",
      "riskLevel": "high",
      "sourceUrl": "https://example.com/source-from-compactLegalKnowledge"
    }
  ],
  "exploitNewsFindings": [],
  "sentimentSummary": "Current legal/news context increases risk for custody/admin-control claims."
}

The LLM must output strict JSON because the VS Code diagnostics, report UI,
certification gates, and audit score calculation consume these fields directly.
*/
export const LEGAL_COLLISION_SYSTEM_PROMPT = [
  "You are the legal-risk analyzer inside Pre-Flight Auditor.",
  "Compare the user's stated smart-contract intent against observable Solidity behavior and compact regulatory knowledge.",
  "Return only valid JSON matching the requested schema.",
  "Do not provide legal advice. Flag implementation and marketing-claim mismatches that need review.",
].join(" ");

export function buildLegalCollisionPrompt(input: LegalCollisionPromptInput): string {
  const legalKnowledge = input.legalKnowledge.map((record) => ({
    source: record.source,
    title: record.title,
    url: record.url,
    scrapedAt: record.scrapedAt,
    summary: cap(record.summary, 420),
  }));

  return JSON.stringify(
    {
      task: "Produce a legal collision analysis for a single Solidity file.",
      outputContract: {
        riskLevel: "low | medium | high",
        score: "integer from 0 to 100, higher is safer",
        intentSummary: "short summary of what the contract appears to do",
        codeIntentMismatch: [
          {
            claim: "user-facing or comment claim",
            observedCodeBehavior: "specific behavior observed in code",
            severity: "critical | high | medium | low | info",
            line: "optional positive integer",
          },
        ],
        regulatoryFindings: [
          {
            title: "short finding title",
            summary: "short finding summary",
            riskLevel: "low | medium | high",
            sourceUrl: "supporting source URL",
          },
        ],
        exploitNewsFindings: [],
        sentimentSummary: "short overall legal/news sentiment summary",
      },
      codeIntentSummary: input.intent,
      compactLegalKnowledge: legalKnowledge,
      commentsAndReadmeClaims: cap(input.commentsText ?? "", 1_500),
      sourceExcerpt: input.sourceExcerpt,
      hardRules: [
        "Raise risk when no-admin, immutable, trustless, or non-custodial claims conflict with owner/admin/custody code signals.",
        "Raise risk when asset custody is present and regulatory knowledge suggests classification or disclosure review.",
        "Keep findings concise and source-linked.",
        "Do not invent source URLs outside compactLegalKnowledge.",
      ],
    },
    null,
    2,
  );
}

export function buildSourceExcerpt(sourceCode: string, maxChars = 4_000): string {
  const lines = sourceCode.split(/\r?\n/);
  const relevantLines = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) =>
      /\b(function|contract|modifier|onlyOwner|onlyRole|owner|admin|governance|deposit|withdraw|transfer|upgrade|proxy|delegatecall|pause|unpause)\b/i.test(
        line,
      ),
    )
    .map(({ line, number }) => `${number}: ${line.trim()}`)
    .join("\n");

  return cap(relevantLines || sourceCode, maxChars);
}

function cap(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 3)}...` : normalized;
}
