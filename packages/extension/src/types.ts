export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RiskLevel = "low" | "medium" | "high";
export type Hex = `0x${string}`;

export interface AuditInput {
  auditId: string;
  selectedFilePath: string;
  sourceCode: string;
  chainId: number;
  timestamp: string;
}

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

export interface LegalReport {
  riskLevel: RiskLevel;
  score: number;
  x402PaymentTxHash?: Hex;
  apifyRunId?: string;
  sources: Array<{
    title: string;
    url: string;
    sourceType: "rekt" | "sec" | "mica" | "news" | "social" | "esma" | "eba" | "swarm";
    fetchedAt: string;
    summary: string;
  }>;
  intentSummary: string;
  codeIntentMismatch: Array<{
    claim: string;
    observedCodeBehavior: string;
    severity: Severity;
    line?: number;
  }>;
  regulatoryFindings: Array<{
    title: string;
    summary: string;
    riskLevel: RiskLevel;
    sourceUrl: string;
  }>;
  exploitNewsFindings: Array<{
    title: string;
    summary: string;
    riskLevel: RiskLevel;
    sourceUrl: string;
  }>;
  sentimentSummary: string;
}

export interface SecurityFinding {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  evidence: string;
  recommendation: string;
}

export interface SecurityReport {
  score: number;
  maxSimilarityPercent: number;
  closestMatches: Array<{
    contractName: string;
    address?: Hex;
    chainId?: number;
    source: "sourcify" | "local_curated_index";
    similarityPercent: number;
    label: "blue_chip" | "known_exploit" | "unknown";
    metadataUrl?: string;
  }>;
  findings: SecurityFinding[];
  storageLayoutFindings: Array<{
    title: string;
    severity: Severity;
    description: string;
    affectedSlot?: string;
    referenceContract?: string;
  }>;
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
  sourcifyUrl?: string;
}
