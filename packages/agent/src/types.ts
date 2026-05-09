export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RiskLevel = "low" | "medium" | "high";
export type Hex = `0x${string}`;

export interface AuditLogEvent {
  auditId: string;
  timestamp: string;
  phase:
    | "init"
    | "legal_payment"
    | "legal_scrape"
    | "swarm_fetch"
    | "legal_analysis"
    | "security_parse"
    | "security_similarity"
    | "security_storage"
    | "security_analysis"
    | "report"
    | "mint"
    | "verify"
    | "complete"
    | "error";
  level: "info" | "warn" | "error" | "success";
  message: string;
  data?: Record<string, unknown>;
}

export type EmitLog = (event: AuditLogEvent) => void;

export interface AuditInput {
  auditId: string;
  selectedFilePath: string;
  sourceCode: string;
  readmeText?: string;
  commentsText?: string;
  chainId: number;
  agentAddress?: Hex;
  timestamp: string;
}

export interface LegalReport {
  riskLevel: RiskLevel;
  score: number;
  x402PaymentTxHash?: string;
  apifyRunId?: string;
  sources: LegalSource[];
  intentSummary: string;
  codeIntentMismatch: IntentMismatch[];
  regulatoryFindings: LegalFinding[];
  exploitNewsFindings: LegalFinding[];
  sentimentSummary: string;
}

export interface LegalSource {
  title: string;
  url: string;
  sourceType: "rekt" | "sec" | "mica" | "news" | "social" | "esma" | "eba" | "swarm";
  fetchedAt: string;
  summary: string;
}

export interface IntentMismatch {
  claim: string;
  observedCodeBehavior: string;
  severity: Severity;
  line?: number;
}

export interface LegalFinding {
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  sourceUrl: string;
}

export interface SecurityReport {
  score: number;
  maxSimilarityPercent: number;
  closestMatches: unknown[];
  findings: Array<{
    id: string;
    title: string;
    severity: Severity;
    description: string;
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    evidence: string;
    recommendation: string;
  }>;
  storageLayoutFindings: unknown[];
  astSummary: string;
  llmSecuritySummary: string;
}

export interface AuditResult {
  auditId: string;
  selectedFilePath: string;
  codeHash: Hex;
  reportHash: Hex;
  reportUri: string;
  totalScore: number;
  legalReport: LegalReport;
  securityReport: SecurityReport;
  complianceSuggestions: Array<{
    title: string;
    description: string;
    regulation: string;
    severity: Severity;
  }>;
  certificationEligible: boolean;
  blockingReasons: string[];
  createdAt: string;
}
