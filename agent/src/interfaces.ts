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
  findings: Array<{ severity: Severity; title: string }>;
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
  certificationEligible: boolean;
  blockingReasons: string[];
  createdAt: string;
}

export interface CertificateResult {
  auditId: string;
  registryAddress: Hex;
  transactionHash: Hex;
  certificateHash: Hex;
  baseScanUrl: string;
  reportUri: string;
}

export interface RegistryVerificationResult {
  registryAddress: Hex;
  chainId: number;
  sourcifyStatus: "verified" | "partial" | "failed";
  sourcifyUrl?: string;
  error?: string;
}
