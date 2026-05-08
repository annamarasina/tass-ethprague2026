# Pre-Flight Auditor PRD

## 1. Product Summary

Pre-Flight Auditor is a VS Code extension that runs an autonomous AI audit agent against a selected Solidity file. The agent evaluates legal/product intent, compares the contract against known verified and exploit contracts, detects deep security risks, and, if no critical vulnerabilities are found, mints an on-chain audit certificate on Base Sepolia.

This is a demo-first hackathon MVP optimized for a 3-minute sponsor-focused demo.

Primary sponsors targeted:
- Apify: paid live scraping actor
- Sourcify: contract verification and verified contract intelligence

## 2. MVP Demo Path

1. User opens a Solidity file in VS Code.
2. User runs `Pre-Flight Audit` from the Command Palette or sidebar.
3. Sidebar WebView opens with a live terminal-style log feed.
4. Agent reads selected `.sol` file, project `README.md`, comments, and local Foundry/Hardhat artifacts if available.
5. Agent autonomously pays via x402 using USDC on Base Sepolia.
6. Apify actor fetches live legal, regulatory, exploit, and sentiment data.
7. Agent compares product intent against actual Solidity behavior.
8. Agent performs AST similarity and storage layout diffing against curated Sourcify-backed datasets.
9. Agent displays a final report with Pre-Flight Score, legal risk, severity-ranked findings, similarity match percentage, and code annotations.
10. If no critical vulnerabilities exist, user clicks `Mint Certificate`.
11. Agent calls `issueCertificate()` on `AuditRegistry.sol`.
12. UI displays BaseScan transaction link, certificate hash, and Sourcify verification link for `AuditRegistry.sol`.

## 3. Non-Goals

The MVP will not include production authentication, multi-user accounts, hosted backend, revocation, multi-file full-project auditing, production-grade legal advice, robust key management, exhaustive 27M-contract indexing, automatic remediation, or certificate NFT implementation.

## 4. Team Structure

Team size: 4

Roles:
- Frontend Developer: VS Code extension, WebView dashboard, diagnostics, UX
- Backend Developer 1: Apify + x402 legal/sentiment workstream
- Backend Developer 2: Sourcify dataset, AST similarity, storage layout diffing
- Backend Developer 3: Foundry smart contract registry, deployment, Sourcify verification, minting integration

The architecture must allow all 3 backend developers to work in parallel through strict TypeScript interfaces and mock adapters.

## 5. Technical Architecture

```text
VS Code Extension
  |-- Command Palette: Pre-Flight Audit
  |-- Sidebar WebView Dashboard
  |-- VS Code Diagnostics
  `-- Local Agent Service Client

Local Node.js Agent Service
  |-- Tool Router / Orchestrator
  |-- Legal Tool: Apify + x402
  |-- Security Tool: Sourcify + AST + Storage Layout
  |-- Certification Tool: Registry + Sourcify Verification
  |-- OpenAI GPT-4o Analysis Layer
  `-- Local JSON Audit History

Blockchain
  |-- Base Sepolia
  |-- Agent Wallet from .env
  |-- USDC x402 Payment
  `-- AuditRegistry.sol

External Services
  |-- Apify Actor
  |-- x402 Payment Flow
  |-- Sourcify v2 Verification API
  |-- Sourcify Public API
  `-- Optional BigQuery / Local Curated Contract Index
```

## 6. User Experience Requirements

The extension must expose:
- Command Palette command: `Pre-Flight Auditor: Run Audit`
- Sidebar view: `Pre-Flight Auditor`

Dashboard states:
- Idle: selected Solidity file, `Run Audit` button, recent audit history
- Running: terminal-style live logs and phase indicator
- Report: score, legal risk, similarity percentage, findings, `Mint Certificate` button if eligible
- Certified: transaction hash, BaseScan link, report URI/hash, certificate hash, Sourcify verification link
- Blocked: critical findings shown, certification disabled

Diagnostics:
- `critical` / `high`: error
- `medium`: warning
- `low`: information

Clicking a finding in the sidebar must reveal the relevant file and line.

## 7. Agent Behavior

The agent runs as a local Node.js service spawned by the VS Code extension.

Requirements:
- TypeScript implementation
- tool-calling-style orchestration
- GPT-4o for interpretation and final synthesis
- internet required
- reads `.env` for wallet/API config
- writes local JSON audit history
- emits structured progress events to frontend

Environment variables:

```bash
OPENAI_API_KEY=
AGENT_PRIVATE_KEY=
BASE_SEPOLIA_RPC_URL=
BASESCAN_BASE_URL=https://sepolia.basescan.org
APIFY_TOKEN=
APIFY_ACTOR_ID=
X402_NETWORK=base-sepolia
X402_ASSET=USDC
SOURCIFY_API_BASE=https://sourcify.dev/server
AUDIT_REGISTRY_ADDRESS=
```

## 8. Strict TypeScript Interfaces

```ts
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RiskLevel = "low" | "medium" | "high";

export interface AuditInput {
  auditId: string;
  selectedFilePath: string;
  sourceCode: string;
  readmeText?: string;
  commentsText?: string;
  chainId: number;
  agentAddress: `0x${string}`;
  timestamp: string;
}

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
  sourceType: "rekt" | "sec" | "mica" | "news" | "social";
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
  closestMatches: SimilarityMatch[];
  findings: SecurityFinding[];
  storageLayoutFindings: StorageLayoutFinding[];
  astSummary: string;
  llmSecuritySummary: string;
}

export interface SimilarityMatch {
  contractName: string;
  address?: `0x${string}`;
  chainId?: number;
  source: "sourcify" | "local_curated_index";
  similarityPercent: number;
  label: "blue_chip" | "known_exploit" | "unknown";
  metadataUrl?: string;
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

export interface StorageLayoutFinding {
  title: string;
  severity: Severity;
  description: string;
  affectedSlot?: string;
  referenceContract?: string;
}

export interface AuditResult {
  auditId: string;
  selectedFilePath: string;
  codeHash: `0x${string}`;
  reportHash: `0x${string}`;
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
  registryAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  certificateHash: `0x${string}`;
  baseScanUrl: string;
  reportUri: string;
}

export interface RegistryVerificationResult {
  registryAddress: `0x${string}`;
  chainId: number;
  sourcifyStatus: "verified" | "partial" | "failed";
  sourcifyUrl?: string;
  error?: string;
}
```

## 9. Backend Workstream 1: Apify + x402 Legal/Sentiment

Owner: Backend Developer 1

Goal: Build the live paid scraping and legal analysis module.

Responsibilities:
- Wrap or configure an Apify actor that accepts x402 payment.
- Use the agent wallet private key from `.env`.
- Pay with USDC on Base Sepolia.
- Fetch live data from Rekt.news, SEC/regulatory crypto news, MiCA/EU crypto regulatory news, and social/general sentiment sources.
- Summarize results with GPT-4o.
- Compare README/comments intent against actual source code behavior.
- Return deterministic `LegalReport`.

Module interface:

```ts
export interface LegalAnalyzer {
  run(input: AuditInput, emit: (event: AuditLogEvent) => void): Promise<LegalReport>;
}
```

Acceptance criteria:
- x402 payment is visible in logs.
- Apify run ID is returned.
- at least 3 live sources are summarized.
- legal risk is one of `low | medium | high`.
- detects at least one README/code mismatch when present.
- produces valid `LegalReport` JSON.

## 10. Backend Workstream 2: Sourcify Dataset Security Analysis

Owner: Backend Developer 2

Goal: Build deep contract comparison using AST similarity and storage layout diffing.

Responsibilities:
- Parse selected Solidity file with `solidity-parser-antlr`.
- Load storage layout from Foundry/Hardhat artifacts when available.
- Query Sourcify Public API where practical.
- Use a curated local index for blue-chip verified contracts, known exploit contracts, and proxy-related examples.
- Compute AST similarity percentage.
- Compare storage layouts for collision risks.
- Use GPT-4o to explain similarity and diff results.
- Return deterministic `SecurityReport`.

Module interface:

```ts
export interface SecurityAnalyzer {
  run(input: AuditInput, emit: (event: AuditLogEvent) => void): Promise<SecurityReport>;
}
```

MVP must detect or flag:
- owner/admin functionality
- proxy storage collision risk
- suspicious upgradeability patterns
- high similarity to known exploit contract
- mismatch between claimed decentralization and privileged functions

Acceptance criteria:
- selected `.sol` file is parsed successfully.
- AST similarity score is calculated.
- storage layout diff runs if artifacts exist.
- graceful fallback occurs if artifacts are missing.
- findings include file and line numbers.
- produces valid `SecurityReport` JSON.

## 11. Backend Workstream 3: Smart Contract, Minting, Sourcify Verification

Owner: Backend Developer 3

Goal: Build the on-chain certification registry, deployment flow, mint call, and Sourcify verification flow.

Responsibilities:
- Implement `AuditRegistry.sol`.
- Use Foundry.
- Deploy to Base Sepolia.
- Authorize only the agent wallet to issue certificates.
- Implement TypeScript certification module.
- Call `issueCertificate()` from agent wallet.
- Verify `AuditRegistry.sol` with Sourcify v2 verify API.
- Return transaction and verification links.

Contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditRegistry {
    address public immutable authorizedAgent;

    struct Certificate {
        bytes32 codeHash;
        uint256 totalScore;
        string reportUri;
        uint256 issuedAt;
    }

    mapping(address => Certificate[]) public certificates;

    event CertificateIssued(
        address indexed subject,
        bytes32 indexed codeHash,
        uint256 totalScore,
        string reportUri,
        uint256 issuedAt
    );

    error NotAuthorized();

    constructor(address _authorizedAgent) {
        authorizedAgent = _authorizedAgent;
    }

    function issueCertificate(
        address subject,
        bytes32 codeHash,
        uint256 totalScore,
        string calldata reportUri
    ) external returns (bytes32 certificateHash) {
        if (msg.sender != authorizedAgent) revert NotAuthorized();

        certificates[subject].push(
            Certificate({
                codeHash: codeHash,
                totalScore: totalScore,
                reportUri: reportUri,
                issuedAt: block.timestamp
            })
        );

        certificateHash = keccak256(
            abi.encode(subject, codeHash, totalScore, reportUri, block.timestamp)
        );

        emit CertificateIssued(subject, codeHash, totalScore, reportUri, block.timestamp);
    }
}
```

Module interface:

```ts
export interface CertificationService {
  verifyRegistry(emit: (event: AuditLogEvent) => void): Promise<RegistryVerificationResult>;

  issueCertificate(
    auditResult: AuditResult,
    emit: (event: AuditLogEvent) => void
  ): Promise<CertificateResult>;
}
```

Acceptance criteria:
- registry deploys to Base Sepolia.
- only agent wallet can call `issueCertificate`.
- Sourcify verification returns a visible result.
- successful certificate issuance returns transaction hash.
- BaseScan link is displayed in frontend.
- certificate is blocked when `certificationEligible === false`.

## 12. Frontend Workstream

Owner: Frontend Developer

Goal: Build the VS Code extension UI and integrate against mock adapters first.

Responsibilities:
- scaffold TypeScript VS Code extension
- add command palette command
- add sidebar WebView
- spawn local Node.js agent service
- stream logs into terminal-style UI
- render audit report
- render certificate state
- add diagnostics to selected Solidity file
- allow clicking findings to jump to source lines
- use mock backend adapters until real modules are ready

Acceptance criteria:
- frontend works against mocks by Hour 10.
- diagnostics appear in Solidity file.
- click-to-line works.
- report renders from `AuditResult`.
- mint button calls certification module.
- UI remains polished and demo-ready.

## 13. Orchestration Flow

```ts
async function runAudit(input: AuditInput): Promise<AuditResult> {
  emit("init", "Reading selected Solidity file");

  const [legalReport, securityReport] = await Promise.all([
    legalAnalyzer.run(input, emit),
    securityAnalyzer.run(input, emit)
  ]);

  const totalScore = calculatePreFlightScore(legalReport, securityReport);
  const codeHash = keccak256(input.sourceCode);
  const reportHash = keccak256(JSON.stringify({ legalReport, securityReport }));

  const criticalFindings = securityReport.findings.filter(f => f.severity === "critical");
  const certificationEligible = criticalFindings.length === 0;

  return {
    auditId: input.auditId,
    selectedFilePath: input.selectedFilePath,
    codeHash,
    reportHash,
    reportUri: `local://preflight-audits/${input.auditId}.json`,
    totalScore,
    legalReport,
    securityReport,
    certificationEligible,
    blockingReasons: criticalFindings.map(f => f.title),
    createdAt: new Date().toISOString()
  };
}
```

## 14. Scoring Model

Pre-Flight Score: 0-100

Suggested weighting:
- Security: 60%
- Legal/product intent: 25%
- Similarity confidence: 15%

Security penalties:
- critical: automatic certification block
- high: -25
- medium: -10
- low: -3

Legal risk scoring:
- low: 90-100
- medium: 60-80
- high: 0-50

Similarity scoring:
- high similarity to blue-chip contract: positive signal
- high similarity to known exploit: severe negative signal
- storage collision risk: high or critical depending confidence

## 15. Persistence

Audit history must be stored locally as JSON.

```text
.vscode/preflight-audits/
  audit-history.json
  {auditId}.json
```

## 16. 48-Hour Build Plan

### Hours 0-2: Alignment and Scaffolding

All:
- confirm interfaces
- create repo structure
- assign workstreams

Frontend:
- scaffold VS Code extension

Backend 1:
- scaffold legal analyzer module and mock

Backend 2:
- scaffold security analyzer module and mock

Backend 3:
- scaffold Foundry project and contract

### Hours 2-6: Mock-First Integration

Frontend:
- implement sidebar WebView
- implement command palette command
- render mock logs and mock report

Backend 1:
- finalize `MockLegalAnalyzer`

Backend 2:
- finalize `MockSecurityAnalyzer`

Backend 3:
- finalize `MockCertificationService`

Integration:
- run full fake audit end-to-end

### Hours 6-12: Real Core Modules Begin

Frontend:
- diagnostics
- click-to-line findings
- polished live log UI

Backend 1:
- x402 payment flow
- Apify actor wrapper

Backend 2:
- Solidity parser
- AST extraction
- curated index format

Backend 3:
- implement `AuditRegistry.sol`
- Foundry deploy script
- Base Sepolia deployment

### Hours 12-20: Real Data Integration

Frontend:
- connect WebView to agent service events
- render real reports

Backend 1:
- live Apify scrape
- GPT-4o legal summary
- deterministic `LegalReport`

Backend 2:
- AST similarity calculation
- line-number findings
- initial storage layout artifact loading

Backend 3:
- TypeScript minting service
- Sourcify verification request

### Hours 20-30: End-to-End Happy Path

All:
- integrate real modules behind shared interfaces

Frontend:
- report UI polish
- error states
- certificate state

Backend 1:
- ensure x402 payment logs are visible

Backend 2:
- tune curated examples for impressive similarity output

Backend 3:
- verify deployed registry with Sourcify
- test certificate minting

### Hours 30-38: Demo Hardening

All:
- run full demo repeatedly
- fix brittle assumptions
- add fallback mocks behind flags

Frontend:
- improve visual hierarchy
- make log feed demo-readable

Backend 1:
- cache fallback only if live scrape fails

Backend 2:
- ensure selected demo contract produces meaningful findings

Backend 3:
- verify BaseScan and Sourcify links

### Hours 38-44: Scripted Demo Prep

All:
- prepare demo Solidity contract
- prepare README with intentional claim mismatch
- rehearse 3-minute flow

Demo must show:
- command invocation
- live Apify payment
- live logs
- similarity/security findings
- diagnostics
- mint certificate
- BaseScan link
- Sourcify verification link

### Hours 44-48: Final Polish

All:
- freeze features
- fix only demo blockers
- clean README
- record backup demo video
- prepare sponsor-specific talking points

## 17. Demo Contract Recommendation

Prepare two files:
- `UnsafeVault.sol`: critical/high finding, certification blocked
- `SafeVault.sol`: low/medium findings only, certification allowed

Use README claims like "No admin controls" while the unsafe contract includes `onlyOwner` behavior to show intent mismatch.

## 18. Definition of Done

The MVP is complete when:
- VS Code extension runs from Command Palette.
- Sidebar opens and streams live logs.
- Selected `.sol` file is audited.
- Apify scraping runs live.
- x402 payment is real and visible.
- Sourcify-backed or curated similarity analysis runs.
- AST similarity percentage is displayed.
- storage layout diffing runs or gracefully falls back.
- GPT-4o produces structured legal and security summaries.
- diagnostics appear in the editor.
- critical findings block certification.
- non-critical report can mint a certificate.
- `AuditRegistry.sol` is deployed on Base Sepolia.
- registry is verified through Sourcify.
- certificate transaction link appears in UI.
- local JSON audit history is written.
- full demo completes in under 3 minutes.

## 19. Risk Register

| Risk | Impact | Mitigation |
|---|---:|---|
| x402/Apify integration takes too long | High | build mock first; isolate in LegalAnalyzer |
| Sourcify large-scale dataset unavailable | Medium | use curated local index plus Sourcify API |
| storage layout artifacts missing | Medium | gracefully fallback to AST-only mode |
| Base Sepolia RPC instability | Medium | have backup RPC URL |
| Sourcify verification fails | Medium | show attempted verification and cached prior success |
| GPT output malformed | High | enforce JSON schema validation and retry |
| demo exceeds 3 minutes | High | preselect demo files and keep flow single-click |

## 20. Recommended Repo Structure

```text
pre-flight-auditor/
  extension/
    src/
      extension.ts
      webview/
      diagnostics/
      client/
  agent/
    src/
      index.ts
      orchestrator.ts
      interfaces.ts
      scoring.ts
      history.ts
      tools/
        legal/
          LegalAnalyzer.ts
          MockLegalAnalyzer.ts
          ApifyX402LegalAnalyzer.ts
        security/
          SecurityAnalyzer.ts
          MockSecurityAnalyzer.ts
          SourcifySecurityAnalyzer.ts
          curated-index/
        certification/
          CertificationService.ts
          MockCertificationService.ts
          RegistryCertificationService.ts
  contracts/
    src/
      AuditRegistry.sol
    script/
      Deploy.s.sol
    test/
      AuditRegistry.t.sol
    foundry.toml
  .env.example
  README.md
```

## 21. Final Implementation Principle

Build mock adapters first, integrate the full UX immediately, then replace mocks with real sponsor integrations one by one. The demo should always remain runnable while backend workstreams progress independently.
