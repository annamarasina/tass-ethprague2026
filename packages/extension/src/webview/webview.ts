type WebviewState = "idle" | "running" | "report" | "blocked" | "certified" | "error";

interface WebviewLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  phase: string;
  message: string;
  data?: Record<string, unknown>;
}

interface WebviewModel {
  state: WebviewState;
  selectedFilePath?: string;
  logs: WebviewLog[];
  statusMessage?: string;
  auditResult?: {
    totalScore: number;
    certificationEligible: boolean;
    blockingReasons: string[];
    complianceSuggestions?: Array<{
      title: string;
      description: string;
      regulation: string;
      severity: string;
    }>;
    securityReport: {
      score?: number;
      maxSimilarityPercent?: number;
      closestMatches?: Array<{
        contractName: string;
        address?: string;
        chainId?: number;
        source: string;
        similarityPercent: number;
        label: string;
        metadataUrl?: string;
      }>;
      findings: Array<{
        id: string;
        title: string;
        severity: string;
        description: string;
        lineStart: number;
        lineEnd?: number;
        recommendation: string;
      }>;
      storageLayoutFindings?: Array<{
        title: string;
        severity: string;
        description: string;
        affectedSlot?: string;
        referenceContract?: string;
      }>;
      astSummary?: string;
      llmSecuritySummary?: string;
    };
  };
  certificateResult?: {
    registryAddress: string;
    transactionHash: string;
    certificateHash: string;
    baseScanUrl: string;
    sourcifyUrl?: string;
  };
}

type WebviewToExtensionMessage =
  | { type: "runComplianceAudit"; sourceCode?: string }
  | { type: "runAudit"; sourceCode?: string }
  | { type: "jumpToFinding"; findingId: string }
  | { type: "mintCertificate" }
  | { type: "openExternal"; url: string };

type ExtensionToWebviewMessage =
  | { type: "replaceState"; model: WebviewModel }
  | { type: "appendLog"; log: WebviewLog; state?: WebviewState; statusMessage?: string };

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToExtensionMessage): void;
};

const vscode = acquireVsCodeApi();
const solidScanWindow = window as Window & { __SOLID_SCAN_MODEL__?: WebviewModel };
let model: WebviewModel = solidScanWindow.__SOLID_SCAN_MODEL__ ?? {
  state: "idle",
  logs: [],
};

const runButton = document.querySelector<HTMLButtonElement>("#runAudit");
const statusMessage = document.querySelector<HTMLElement>("#statusMessage");
const statePill = document.querySelector<HTMLElement>("#statePill");
const statusCard = document.querySelector<HTMLElement>("#statusCard");
const progressBar = document.querySelector<HTMLElement>("#progressBar");
const progressBarFill = document.querySelector<HTMLElement>("#progressBarFill");
const codeInput = document.querySelector<HTMLTextAreaElement>("#codeInput");
const seeReportFromCode = document.querySelector<HTMLButtonElement>("#seeReportFromCode");
const summary = document.querySelector<HTMLElement>("#summary");
const reportSubtitle = document.querySelector<HTMLElement>("#reportSubtitle");
const mintCertificate = document.querySelector<HTMLButtonElement>("#mintCertificate");
const blockedNote = document.querySelector<HTMLElement>("#blockedNote");
const complianceSuggestions = document.querySelector<HTMLElement>("#complianceSuggestions");
const securityFindings = document.querySelector<HTMLElement>("#securityFindings");
const certifiedPanel = document.querySelector<HTMLElement>("#certifiedPanel");
const certificateHash = document.querySelector<HTMLElement>("#certificateHash");
const baseScanLink = document.querySelector<HTMLButtonElement>("#baseScanLink");
const sourcifyLink = document.querySelector<HTMLButtonElement>("#sourcifyLink");
const paymentPanel = document.querySelector<HTMLElement>("#paymentPanel");
const paymentSubtitle = document.querySelector<HTMLElement>("#paymentSubtitle");
const approvePayment = document.querySelector<HTMLButtonElement>("#approvePayment");
const cancelPayment = document.querySelector<HTMLButtonElement>("#cancelPayment");

// Compliance carousel elements
const logsCompliance = document.querySelector<HTMLElement>("#logsCompliance");
const logPrevCompliance = document.querySelector<HTMLButtonElement>("#logPrevCompliance");
const logNextCompliance = document.querySelector<HTMLButtonElement>("#logNextCompliance");
const logIndexCompliance = document.querySelector<HTMLElement>("#logIndexCompliance");

// Security carousel elements
const logsSecurity = document.querySelector<HTMLElement>("#logsSecurity");
const logPrevSecurity = document.querySelector<HTMLButtonElement>("#logPrevSecurity");
const logNextSecurity = document.querySelector<HTMLButtonElement>("#logNextSecurity");
const logIndexSecurity = document.querySelector<HTMLElement>("#logIndexSecurity");

let complianceLogIndex = 0;
let securityLogIndex = 0;
let auditProgressStartedAt: number | undefined;
let auditProgressTimer: number | undefined;
let auditProgressPercent = 0;

const COMPLIANCE_PHASE_ORDER = [
  "compliance_classify",
  "compliance_scrape",
  "compliance_payment",
  "compliance_sources",
  "swarm_fetch",
  "compliance_output",
] as const;
const SECURITY_PHASE_ORDER = ["security_parse", "security_similarity", "security_storage", "security_analysis"] as const;
const COMPLIANCE_PHASES = new Set<string>(COMPLIANCE_PHASE_ORDER);
const SECURITY_PHASES = new Set<string>(SECURITY_PHASE_ORDER);
const SECURITY_TOTAL_STEPS = 7;
const AUDIT_PROGRESS_ESTIMATE_MS = 28_000;
const PHASE_PROGRESS: Record<string, number> = {
  init: 4,
  compliance_classify: 12,
  compliance_scrape: 24,
  compliance_payment: 34,
  swarm_fetch: 48,
  compliance_sources: 58,
  compliance_analysis: 66,
  compliance_output: 74,
  security_parse: 80,
  security_similarity: 86,
  security_storage: 90,
  security_analysis: 95,
  report: 100,
};

function latestLogsForPhases(phases: readonly string[]): WebviewLog[] {
  const latestByPhase = new Map<string, WebviewLog>();

  for (const log of model.logs) {
    if (phases.includes(log.phase)) {
      latestByPhase.set(log.phase, log);
    }
  }

  return phases.flatMap((phase) => {
    const log = latestByPhase.get(phase);
    return log ? [log] : [];
  });
}

function getComplianceLogs(): WebviewLog[] {
  const latestByPhase = new Map<string, WebviewLog>();

  for (const log of model.logs) {
    if (COMPLIANCE_PHASES.has(log.phase)) {
      latestByPhase.set(log.phase, log);
    }
  }

  if (!latestByPhase.has("swarm_fetch")) {
    const sourceLog = latestByPhase.get("compliance_sources");

    if (sourceLog) {
      latestByPhase.set("swarm_fetch", {
        timestamp: sourceLog.timestamp,
        level: "success",
        phase: "swarm_fetch",
        message: "Compliance context available through Swarm integration",
        data: {
          gateway: "configured gateway",
          records: sourceLog.data?.count,
          category: sourceLog.data?.category ?? "compliance",
          source: sourceLog.data?.source,
        },
      });
    }
  }

  return COMPLIANCE_PHASE_ORDER.flatMap((phase) => {
    const log = latestByPhase.get(phase);
    return log ? [log] : [];
  });
}

function getSecurityLogs(): WebviewLog[] {
  const securityLogs = latestLogsForPhases(SECURITY_PHASE_ORDER);
  const result = model.auditResult;

  if (!result) {
    return securityLogs;
  }

  return [
    ...securityLogs,
    {
      timestamp: new Date().toISOString(),
      level: "info",
      phase: "security_matches",
      message: "Similarity matches summarized",
      data: {
        maxSimilarityPercent: result.securityReport.maxSimilarityPercent,
        closestMatches: result.securityReport.closestMatches ?? [],
      },
    },
    {
      timestamp: new Date().toISOString(),
      level: result.securityReport.findings.some((finding) => finding.severity === "critical" || finding.severity === "high") ? "warn" : "success",
      phase: "security_findings",
      message: "Vulnerability findings summarized",
      data: {
        findings: result.securityReport.findings,
      },
    },
    {
      timestamp: new Date().toISOString(),
      level: (result.securityReport.storageLayoutFindings ?? []).some((finding) => finding.severity === "critical" || finding.severity === "high") ? "warn" : "success",
      phase: "security_storage_findings",
      message: "Storage layout findings summarized",
      data: {
        findings: result.securityReport.storageLayoutFindings ?? [],
        astSummary: result.securityReport.astSummary,
        llmSecuritySummary: result.securityReport.llmSecuritySummary,
      },
    },
  ];
}

// ─── Tab switching ───
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabPanes = document.querySelectorAll<HTMLElement>(".tab-pane");

function switchTab(tabId: string) {
  tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanes.forEach((pane) => pane.classList.toggle("active", pane.id === tabId));
}

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    if (target) switchTab(target);
  });
});

// ─── Log carousel navigation ───
logPrevCompliance?.addEventListener("click", () => {
  if (complianceLogIndex > 0) {
    complianceLogIndex--;
    renderCarousel("compliance");
  }
});

logNextCompliance?.addEventListener("click", () => {
  const items = getComplianceLogs();
  if (complianceLogIndex < items.length - 1) {
    complianceLogIndex++;
    renderCarousel("compliance");
  }
});

logPrevSecurity?.addEventListener("click", () => {
  if (securityLogIndex > 0) {
    securityLogIndex--;
    renderCarousel("security");
  }
});

logNextSecurity?.addEventListener("click", () => {
  const items = getSecurityLogs();
  if (securityLogIndex < items.length - 1) {
    securityLogIndex++;
    renderCarousel("security");
  }
});

function renderCarousel(section: "compliance" | "security"): void {
  const container = section === "compliance" ? logsCompliance : logsSecurity;
  const indexEl = section === "compliance" ? logIndexCompliance : logIndexSecurity;
  const prevBtn = section === "compliance" ? logPrevCompliance : logPrevSecurity;
  const nextBtn = section === "compliance" ? logNextCompliance : logNextSecurity;
  const items = section === "compliance" ? getComplianceLogs() : getSecurityLogs();
  const idx = section === "compliance" ? complianceLogIndex : securityLogIndex;

  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="empty">${section === "compliance" ? "Compliance steps will appear here." : "Security steps will appear here."}</div>`;
    if (indexEl) indexEl.textContent = "–";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // Clamp
  const clamped = Math.max(0, Math.min(idx, items.length - 1));
  if (section === "compliance") complianceLogIndex = clamped;
  else securityLogIndex = clamped;

  const entry = renderLog(items[clamped]);
  container.replaceChildren(entry);

  if (indexEl) indexEl.textContent = `${clamped + 1} / ${items.length}`;
  if (prevBtn) prevBtn.disabled = clamped === 0;
  if (nextBtn) nextBtn.disabled = clamped === items.length - 1;
}

runButton?.addEventListener("click", () => {
  showMockPaymentRequest();
});

seeReportFromCode?.addEventListener("click", () => {
  switchTab("tabLog");
});

mintCertificate?.addEventListener("click", () => {
  vscode.postMessage({ type: "mintCertificate" });
});

baseScanLink?.addEventListener("click", () => {
  if (model.certificateResult?.baseScanUrl) {
    vscode.postMessage({ type: "openExternal", url: model.certificateResult.baseScanUrl });
  }
});

sourcifyLink?.addEventListener("click", () => {
  if (model.certificateResult?.sourcifyUrl) {
    vscode.postMessage({ type: "openExternal", url: model.certificateResult.sourcifyUrl });
  }
});

approvePayment?.addEventListener("click", () => {
  approveMockPayment();
});

cancelPayment?.addEventListener("click", () => {
  hideMockPaymentRequest();
});

window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;

  if (message.type === "replaceState") {
    model = message.model;
    syncAuditProgress();
    render();
    return;
  }

  if (message.type === "appendLog") {
    model = {
      ...model,
      state: message.state ?? model.state,
      statusMessage: message.statusMessage ?? model.statusMessage,
      logs: [...model.logs, message.log],
    };
    syncAuditProgress(message.log);
    render();
  }
});

syncAuditProgress();
render();

function render(): void {

  if (runButton) {
    runButton.disabled = model.state === "running" || paymentPanel?.classList.contains("visible") === true;
  }



  if (statusMessage) {
    statusMessage.textContent = model.statusMessage ?? defaultStatus(model);
  }

  if (statePill) {
    statePill.textContent = model.state;
    statePill.className = `pill ${model.state}`;
  }

  if (statusCard) {
    statusCard.classList.toggle("running", model.state === "running");
  }

  renderAuditProgress();

  if (codeInput) {
    codeInput.disabled = model.state === "running";
  }

  if (seeReportFromCode) {
    seeReportFromCode.classList.toggle("visible", Boolean(model.auditResult) && model.state !== "running");
  }

  // Keep carousels on first entry by default, only advance if still at 0
  renderCarousel("compliance");
  renderCarousel("security");

  renderSummary();
}

function syncAuditProgress(log?: WebviewLog): void {
  if (model.state === "running") {
    if (auditProgressStartedAt === undefined) {
      auditProgressStartedAt = Date.now();
      auditProgressPercent = Math.max(auditProgressPercent, 2);
    }

    if (log) {
      auditProgressPercent = Math.max(auditProgressPercent, PHASE_PROGRESS[log.phase] ?? auditProgressPercent);
    }

    if (auditProgressTimer === undefined) {
      auditProgressTimer = window.setInterval(() => {
        updateTimeBasedProgress();
        renderAuditProgress();
      }, 350);
    }

    updateTimeBasedProgress();
    return;
  }

  if (auditProgressTimer !== undefined) {
    window.clearInterval(auditProgressTimer);
    auditProgressTimer = undefined;
  }

  auditProgressStartedAt = undefined;
  auditProgressPercent = model.state === "report" || model.state === "blocked" || model.state === "certified" ? 100 : 0;
}

function updateTimeBasedProgress(): void {
  if (auditProgressStartedAt === undefined || model.state !== "running") {
    return;
  }

  const elapsed = Date.now() - auditProgressStartedAt;
  const elapsedRatio = Math.min(elapsed / AUDIT_PROGRESS_ESTIMATE_MS, 1);
  const eased = 1 - Math.pow(1 - elapsedRatio, 2.2);
  auditProgressPercent = Math.max(auditProgressPercent, Math.min(92, Math.round(eased * 92)));
}

function renderAuditProgress(): void {
  const isRunning = model.state === "running";

  if (progressBar) {
    progressBar.classList.toggle("active", isRunning);
    progressBar.setAttribute("aria-valuenow", String(Math.round(auditProgressPercent)));
  }

  if (progressBarFill) {
    progressBarFill.style.width = `${Math.max(0, Math.min(100, auditProgressPercent))}%`;
  }
}

function showMockPaymentRequest(): void {
  if (model.state === "running") {
    return;
  }

  paymentPanel?.classList.add("visible");

  if (paymentSubtitle) {
    paymentSubtitle.textContent = "Approve the x402 authorization for the live Apify compliance lookup.";
  }

  if (approvePayment) {
    approvePayment.disabled = false;
    approvePayment.textContent = "Approve x402";
  }

  if (cancelPayment) {
    cancelPayment.disabled = false;
  }

  render();
}

function hideMockPaymentRequest(): void {
  paymentPanel?.classList.remove("visible");
  render();
}

function approveMockPayment(): void {
  if (approvePayment) {
    approvePayment.disabled = true;
    approvePayment.textContent = "Signing...";
  }

  if (cancelPayment) {
    cancelPayment.disabled = true;
  }

  if (paymentSubtitle) {
    paymentSubtitle.textContent = "x402 authorization prepared. Submitting paid audit request...";
  }

  window.setTimeout(() => {
    hideMockPaymentRequest();
    const sourceCode = codeInput?.value.trim() || undefined;
    vscode.postMessage({ type: "runComplianceAudit", sourceCode });
  }, 700);
}

function renderLog(log: WebviewModel["logs"][number]): HTMLElement {
  const trace = renderComplianceTrace(log);
  if (trace) {
    return trace;
  }

  const row = document.createElement("div");
  row.className = `log ${log.level}`;

  const meta = document.createElement("div");
  meta.className = "log-meta";
  meta.textContent = `${timeOnly(log.timestamp)} ${log.phase}`;

  const message = document.createElement("div");
  message.className = "log-message";
  message.textContent = log.message;

  row.append(meta, message);
  return row;
}

function renderComplianceTrace(log: WebviewModel["logs"][number]): HTMLElement | undefined {
  if (log.phase === "compliance_classify") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard("1/6", "Agent interprets contract intent", [
      ["Contract", joinUnknown(data.contractNames) || "Selected contract"],
      ["Protocol", stringValue(data.likelyProtocolType, "unknown")],
      ["Category", stringValue(data.category, "detecting")],
      ["Admin signals", joinUnknown(data.adminSignals) || "none"],
      ["Asset signals", joinUnknown(data.assetCustodySignals) || "none"],
      ["Upgrade signals", joinUnknown(data.upgradeabilitySignals) || "none"],
      ["Declared claims", joinUnknown(data.declaredClaims) || "none"],
      ["Summary", stringValue(data.summary, log.message)],
    ]);
  }

  if (log.phase === "compliance_payment") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard("3/6", "Agent payment path", [
      ["Network", stringValue(data.network, "unknown")],
      ["Asset", stringValue(data.asset, "unknown")],
      ["Path", paymentPathLabel(data.mode)],
      ["Provider", stringValue(data.providerMode, "unknown")],
      ["Actor", stringValue(data.actorId ?? data.category, "unknown")],
      ["Payer", "Solid Scan agent"],
      ["Payment ref", stringValue(data.paymentTxHash, "unavailable")],
    ], data.mocked === true ? "warn" : "success");
  }

  if (log.phase === "compliance_scrape") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard("2/6", "Agent actor invocation", [
      ["Caller", "Solid Scan agent"],
      ["User action", "Requested audit"],
      ["Actor", stringValue(data.scraperName ?? data.actorId ?? data.category, "compliance regulation actor")],
      ["Source", stringValue(data.source ?? data.fallbackSource, "regulation scraper")],
      ["Apify run", stringValue(data.apifyRunId, "unavailable")],
      ["Records", stringValue(data.records, "0")],
      ["Reason", stringValue(data.reason, "none")],
    ], log.level === "success" ? "success" : "warn");
  }

  if (log.phase === "swarm_fetch") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard("5/6", "Swarm integration", [
      ["Status", log.message],
      ["Gateway", stringValue(data.gateway, "configured gateway")],
      ["Swarm ref", stringValue(data.swarmHash, "pending")],
      ["Records", stringValue(data.recordCount ?? data.records, "pending")],
      ["Category", stringValue(data.category, "compliance")],
      ["Purpose", "Persist and verify compliance context"],
      ["Error", stringValue(data.error, "none")],
    ], log.level === "warn" || log.level === "error" ? "warn" : "success");
  }

  if (log.phase === "compliance_sources") {
    const data = log.data ?? {};
    const sources = arrayValue(data.sources).slice(0, 5);
    const rows: Array<[string, string]> = [
      ["Retriever", "Solid Scan agent"],
      ["Source path", stringValue(data.source, "swarm/cache")],
      ["Sources", stringValue(data.count, String(sources.length))],
      ["AI model input", "Regulation excerpts + contract intent"],
    ];

    for (const [index, source] of sources.entries()) {
      if (!isRecord(source)) {
        continue;
      }

      rows.push([`#${index + 1}`, `${stringValue(source.title, "Untitled")} (${stringValue(source.sourceType, "source")})`]);
      rows.push(["URL", stringValue(source.url, "")]);
    }

    return renderTraceKeyValueCard("4/6", "Context retrieved for AI model", rows, "success");
  }

  if (log.phase === "compliance_analysis") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard("5/6", "LLM compliance analysis", [
      ["Sources", stringValue(data.sourceCount, "0")],
      ["Protocol", stringValue(data.likelyProtocolType, "unknown")],
      ["Status", log.message],
    ]);
  }

  if (log.phase === "compliance_output") {
    const data = log.data ?? {};
    const findings = arrayValue(data.regulatoryFindings);
    const mismatches = arrayValue(data.mismatches);
    const rows: Array<[string, string]> = [
      ["Risk", stringValue(data.riskLevel, "unknown")],
      ["Score", stringValue(data.score, "0")],
      ["Mismatches", String(mismatches.length)],
      ["Findings", String(findings.length)],
      ["Apify run", stringValue(data.apifyRunId, "unavailable")],
    ];

    for (const [index, finding] of findings.slice(0, 3).entries()) {
      if (!isRecord(finding)) {
        continue;
      }
      rows.push([`Finding ${index + 1}`, `${stringValue(finding.title, "Finding")} - ${stringValue(finding.summary, "")}`]);
    }

    rows.push(["Summary", stringValue(data.sentimentSummary, log.message)]);
    return renderTraceKeyValueCard("6/6", "LLM compliance output", rows, data.riskLevel === "high" ? "warn" : "success");
  }

  if (log.phase === "security_parse") {
    return renderTraceKeyValueCard(`1/${SECURITY_TOTAL_STEPS}`, "Security surface parsed", [
      ["Status", log.message],
    ]);
  }

  if (log.phase === "security_similarity") {
    const data = log.data ?? {};
    const report = model.auditResult?.securityReport;
    const maxSimilarity = data.maxSimilarityPercent ?? report?.maxSimilarityPercent;
    const findings = data.findings ?? report?.findings.length;
    const rowsAboveThreshold = data.rowsAboveThreshold ?? (report ? "See final matches" : "pending");
    const topMatches = arrayValue(data.topMatches).length > 0
      ? arrayValue(data.topMatches)
      : arrayValue(report?.closestMatches).map((match) => {
          if (!isRecord(match)) {
            return match;
          }
          return {
            row: stringValue(match.contractName, "unknown"),
            score: `${stringValue(match.similarityPercent, "?")}%`,
          };
        });
    const rows: Array<[string, string]> = [
      ["Status", log.message],
      ["Max similarity", stringValue(maxSimilarity, "pending")],
      ["Findings", stringValue(findings, "pending")],
      ["Rows above threshold", stringValue(rowsAboveThreshold, "pending")],
    ];
    for (const [index, match] of topMatches.slice(0, 3).entries()) {
      if (!isRecord(match)) {
        continue;
      }
      rows.push([`Match ${index + 1}`, `row ${stringValue(match.row, "?")} - ${stringValue(match.score, "?")}`]);
    }
    return renderTraceKeyValueCard(`2/${SECURITY_TOTAL_STEPS}`, "Security similarity review", rows, log.level === "success" ? "success" : undefined);
  }

  if (log.phase === "security_storage") {
    const data = log.data ?? {};
    const rows: Array<[string, string]> = [["Status", log.message]];
    for (const [index, lookup] of arrayValue(data.lookups).slice(0, 3).entries()) {
      if (!isRecord(lookup)) {
        continue;
      }
      rows.push([`Lookup ${index + 1}`, `row ${stringValue(lookup.row, "?")} - ${stringValue(lookup.sourceHash, "source hash unavailable")}`]);
      const deployments = arrayValue(lookup.deployments);
      const deployment = deployments.find(isRecord);
      if (deployment) {
        rows.push(["Deployment", `${stringValue(deployment.deployment_address, "unknown")} / chain ${stringValue(deployment.chain_id, "?")}`]);
      }
    }
    return renderTraceKeyValueCard(`3/${SECURITY_TOTAL_STEPS}`, "Sourcify source-hash lookup", rows, log.level === "warn" || log.level === "error" ? "warn" : "success");
  }

  if (log.phase === "security_analysis") {
    const data = log.data ?? {};
    return renderTraceKeyValueCard(`4/${SECURITY_TOTAL_STEPS}`, "Security analysis output", [
      ["Score", stringValue(data.score, "unknown")],
      ["Max similarity", stringValue(data.maxSimilarityPercent, "unknown")],
      ["Findings", stringValue(data.findings, "0")],
      ["Status", log.message],
    ], log.level === "error" || log.level === "warn" ? "warn" : "success");
  }

  if (log.phase === "security_matches") {
    const data = log.data ?? {};
    const rows: Array<[string, string]> = [
      ["Max similarity", stringValue(data.maxSimilarityPercent, "unknown")],
    ];

    for (const [index, match] of arrayValue(data.closestMatches).slice(0, 3).entries()) {
      if (!isRecord(match)) {
        continue;
      }

      rows.push([
        `Match ${index + 1}`,
        `${stringValue(match.contractName, "Unknown contract")} - ${stringValue(match.similarityPercent, "?")}% (${stringValue(match.source, "source")})`,
      ]);
    }

    if (rows.length === 1) {
      rows.push(["Matches", "none"]);
    }

    return renderTraceKeyValueCard(`5/${SECURITY_TOTAL_STEPS}`, "Similarity match summary", rows, log.level === "warn" || log.level === "error" ? "warn" : "success");
  }

  if (log.phase === "security_findings") {
    const findings = arrayValue(log.data?.findings);
    const rows: Array<[string, string]> = [["Findings", String(findings.length)]];

    for (const [index, finding] of findings.slice(0, 3).entries()) {
      if (!isRecord(finding)) {
        continue;
      }

      rows.push([
        `Finding ${index + 1}`,
        `${stringValue(finding.title, "Finding")} - ${stringValue(finding.severity, "unknown")}`,
      ]);
      rows.push(["Line", stringValue(finding.lineStart, "unknown")]);
    }

    if (findings.length === 0) {
      rows.push(["Status", "No vulnerability findings"]);
    }

    return renderTraceKeyValueCard(`6/${SECURITY_TOTAL_STEPS}`, "Vulnerability findings", rows, log.level === "warn" || log.level === "error" ? "warn" : "success");
  }

  if (log.phase === "security_storage_findings") {
    const findings = arrayValue(log.data?.findings);
    const rows: Array<[string, string]> = [["Storage findings", String(findings.length)]];

    for (const [index, finding] of findings.slice(0, 3).entries()) {
      if (!isRecord(finding)) {
        continue;
      }

      rows.push([
        `Finding ${index + 1}`,
        `${stringValue(finding.title, "Finding")} - ${stringValue(finding.severity, "unknown")}`,
      ]);
      rows.push(["Slot", stringValue(finding.affectedSlot, "n/a")]);
      rows.push(["Reference", stringValue(finding.referenceContract, "n/a")]);
    }

    rows.push(["Review", stringValue(log.data?.llmSecuritySummary, log.message)]);

    return renderTraceKeyValueCard(`7/${SECURITY_TOTAL_STEPS}`, "Storage layout findings", rows, log.level === "warn" || log.level === "error" ? "warn" : "success");
  }

  return undefined;
}

function renderTraceCard(step: string, title: string, note: string, rows: string[][]): HTMLElement {
  const card = document.createElement("div");
  card.className = "trace-card";
  card.append(renderTraceHeading(step, title));

  const noteElement = document.createElement("div");
  noteElement.className = "trace-note";
  noteElement.textContent = note;

  const table = document.createElement("div");
  table.className = "trace-table";

  for (const [rank, row, score, bar] of rows) {
    const item = document.createElement("div");
    item.className = `trace-row${rank === "1" ? " highlight" : ""}`;
    item.append(
      traceCell(`#${rank}`),
      traceCell(`row ${row}`),
      traceCell(score),
      traceCell(bar, "trace-bar"),
    );
    table.append(item);
  }

  card.append(noteElement, table);
  return card;
}

function renderTraceKeyValueCard(
  step: string,
  title: string,
  rows: Array<[string, string]>,
  tone?: "success" | "warn",
): HTMLElement {
  const card = document.createElement("div");
  card.className = `trace-card${tone ? ` ${tone}` : ""}`;
  card.append(renderTraceHeading(step, title));

  const table = document.createElement("div");
  table.className = "trace-kv";

  for (const [key, value] of rows) {
    const keyElement = document.createElement("div");
    keyElement.className = "trace-key";
    keyElement.textContent = key;

    const valueElement = document.createElement("div");
    valueElement.className = "trace-value";
    valueElement.textContent = value;

    table.append(keyElement, valueElement);
  }

  card.append(table);
  return card;
}

function renderTraceHeading(step: string, title: string): HTMLElement {
  const heading = document.createElement("div");
  heading.className = "trace-heading";

  const titleElement = document.createElement("div");
  titleElement.className = "trace-title";
  titleElement.textContent = title;

  const stepElement = document.createElement("div");
  stepElement.className = "trace-step";
  stepElement.textContent = step;

  heading.append(titleElement, stepElement);
  return heading;
}

function traceCell(text: string, className?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className ?? "";
  element.textContent = text;
  return element;
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinUnknown(value: unknown): string {
  return arrayValue(value)
    .map((item) => stringValue(item, ""))
    .filter(Boolean)
    .join(", ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function paymentPathLabel(value: unknown): string {
  if (value === "enforced") {
    return "settled";
  }

  if (value === "mock") {
    return "authorized";
  }

  return stringValue(value, "authorized");
}

function defaultStatus(current: WebviewModel): string {
  if (current.state === "blocked") {
    return "Certification blocked";
  }

  if (current.state === "report") {
    return "Audit report ready";
  }

  if (current.state === "running") {
    return "Audit running";
  }

  if (current.state === "error") {
    return "Audit failed";
  }

  return "Ready";
}

function renderSummary(): void {
  if (!summary) {
    return;
  }

  const result = model.auditResult;

  if (!result) {
    return;
  }

  if (reportSubtitle) {
    reportSubtitle.textContent = result.certificationEligible ? "Eligible for certificate minting" : "Critical issues must be resolved before certification";
  }

  if (mintCertificate) {
    mintCertificate.classList.toggle("hidden", !result.certificationEligible);
    mintCertificate.disabled = !result.certificationEligible || model.state === "certified" || model.state === "running";
    mintCertificate.textContent = model.state === "certified" ? "Certified" : "Mint Certificate";
  }

  if (blockedNote) {
    blockedNote.classList.toggle("visible", !result.certificationEligible);
    blockedNote.textContent = result.blockingReasons.length > 0
      ? `Certification blocked: ${result.blockingReasons.join(", ")}`
      : "";
  }

  replaceList(
    complianceSuggestions,
    (result.complianceSuggestions ?? []).map((s, i) => ({
      title: `${i + 1}. ${s.title}`,
      tag: s.severity,
      body: s.description,
      meta: s.regulation,
    })),
    "No compliance issues found.",
  );

  replaceList(
    securityFindings,
    [...result.securityReport.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).map((finding) => ({
      id: finding.id,
      title: finding.title,
      tag: finding.severity,
      body: finding.description,
      meta: `line ${finding.lineStart}${finding.lineEnd ? `-${finding.lineEnd}` : ""} | ${finding.recommendation}`,
    })),
    "No vulnerability findings.",
  );

  renderCertificate();
}

function renderCertificate(): void {
  const certificate = model.certificateResult;

  if (certifiedPanel) {
    certifiedPanel.classList.toggle("visible", Boolean(certificate));
  }

  if (!certificate) {
    return;
  }

  if (certificateHash) {
    certificateHash.textContent = `Certificate hash: ${certificate.certificateHash}`;
  }

  if (baseScanLink) {
    baseScanLink.textContent = `${explorerLabel(certificate.baseScanUrl)}: ${certificate.transactionHash}`;
  }

  if (sourcifyLink) {
    sourcifyLink.hidden = !certificate.sourcifyUrl;
    sourcifyLink.textContent = certificate.sourcifyUrl ? `Sourcify: ${certificate.registryAddress}` : "";
  }
}

function replaceList(
  container: HTMLElement | null,
  items: Array<{ id?: string; title: string; tag: string; body: string; meta?: string }>,
  emptyText: string,
): void {
  if (!container) {
    return;
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...items.map(renderItem));
}

function renderItem(item: { id?: string; title: string; tag: string; body: string; meta?: string }): HTMLElement {
  const row = document.createElement("div");
  row.className = "item";

  if (item.id) {
    row.classList.add("clickable");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open finding ${item.title}`);
    row.addEventListener("click", () => vscode.postMessage({ type: "jumpToFinding", findingId: item.id as string }));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        vscode.postMessage({ type: "jumpToFinding", findingId: item.id as string });
      }
    });
  }

  const header = document.createElement("div");
  header.className = "item-header";

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = item.title;

  const tag = document.createElement("div");
  tag.className = `tag ${item.tag}`;
  tag.textContent = item.tag;

  header.append(title, tag);

  const body = document.createElement("div");
  body.className = "item-body";
  body.textContent = item.body;

  row.append(header, body);

  if (item.meta) {
    const meta = document.createElement("div");
    meta.className = "meta-line";
    meta.textContent = item.meta;
    row.append(meta);
  }

  return row;
}

function explorerLabel(url: string): string {
  if (url.includes("etherscan.io")) {
    return "Etherscan";
  }

  if (url.includes("basescan.org")) {
    return "BaseScan";
  }

  return "Explorer";
}

function severityRank(severity: string): number {
  const ranks: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  return ranks[severity] ?? 5;
}

function timeOnly(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
