type WebviewState = "idle" | "running" | "report" | "blocked" | "certified" | "error";

interface WebviewLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  phase: string;
  message: string;
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
      findings: Array<{
        id: string;
        title: string;
        severity: string;
        description: string;
        lineStart: number;
        lineEnd?: number;
        recommendation: string;
      }>;
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
const preflightWindow = window as Window & { __PRE_FLIGHT_MODEL__?: WebviewModel };
let model: WebviewModel = preflightWindow.__PRE_FLIGHT_MODEL__ ?? {
  state: "idle",
  logs: [],
};

const runButton = document.querySelector<HTMLButtonElement>("#runAudit");
const statusMessage = document.querySelector<HTMLElement>("#statusMessage");
const statePill = document.querySelector<HTMLElement>("#statePill");
const statusCard = document.querySelector<HTMLElement>("#statusCard");
const progressBar = document.querySelector<HTMLElement>("#progressBar");
const codeInput = document.querySelector<HTMLTextAreaElement>("#codeInput");
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

const COMPLIANCE_PHASES = new Set(["compliance_classify", "compliance_payment", "compliance_scrape", "compliance_analysis"]);
const SECURITY_PHASES = new Set(["similarity_search", "similarity_filter", "sourcify_hash", "findings_crawl"]);

function getComplianceLogs(): WebviewLog[] {
  return model.logs.filter((l) => COMPLIANCE_PHASES.has(l.phase));
}

function getSecurityLogs(): WebviewLog[] {
  return model.logs.filter((l) => SECURITY_PHASES.has(l.phase));
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
    render();
  }
});

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

  if (progressBar) {
    progressBar.classList.toggle("active", model.state === "running");
  }

  if (codeInput) {
    codeInput.disabled = model.state === "running";
  }

  // Keep carousels on first entry by default, only advance if still at 0
  renderCarousel("compliance");
  renderCarousel("security");

  renderSummary();
}

function showMockPaymentRequest(): void {
  if (model.state === "running") {
    return;
  }

  paymentPanel?.classList.add("visible");

  if (paymentSubtitle) {
    paymentSubtitle.textContent = "Approve the simulated payment for the live Apify compliance lookup.";
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
    paymentSubtitle.textContent = "Mock x402 authorization prepared. Submitting paid audit request...";
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
    return renderTraceKeyValueCard("1/4", "Classifying contract type", [
      ["Agent action", "Reading Solidity code"],
      ["Detected", "ERC-20 Stablecoin (fiat-collateralized)"],
      ["Scraper", "ESMA MiCA Compliance Officer"],
    ]);
  }

  if (log.phase === "compliance_payment") {
    return renderTraceKeyValueCard("2/4", "Paying Apify actor via x402", [
      ["Network", "Base Sepolia"],
      ["Amount", "0.001 USDC"],
      ["Actor", "esma-watchdog"],
      ["Status", "✓ confirmed"],
    ], "success");
  }

  if (log.phase === "compliance_scrape") {
    return renderTraceKeyValueCard("3/4", "Retrieving legal documents", [
      ["Source 1", "ESMA MiCA framework"],
      ["Source 2", "EBA stablecoin guidelines"],
      ["Documents", "4 fetched (12.3 KB)"],
    ]);
  }

  if (log.phase === "compliance_analysis") {
    return renderTraceKeyValueCard("4/4", "LLM compliance analysis", [
      ["Input 1", "Solidity source code"],
      ["Input 2", "MiCA Article 48 (reserves)"],
      ["Input 3", "EBA governance guidelines"],
      ["Status", "Generating suggestions..."],
    ], "success");
  }

  if (log.phase === "similarity_search") {
    return renderTraceCard("1/4", "Vulnerability similarity search", "Embedding cache loaded and ranked against the vulnerability dataset.", [
      ["1", "10", "0.9141", "██████████████████"],
      ["2", "4", "0.7409", "██████████████"],
      ["3", "9", "0.7222", "██████████████"],
      ["4", "5", "0.7120", "██████████████"],
      ["5", "0", "0.7021", "██████████████"],
    ]);
  }

  if (log.phase === "similarity_filter") {
    return renderTraceKeyValueCard("2/4", "Filter similarity > 0.90", [
      ["Selected row", "10"],
      ["Score", "0.9141"],
      ["Status", "Passed threshold"],
    ], "success");
  }

  if (log.phase === "sourcify_hash") {
    return renderTraceKeyValueCard("3/4", "Sourcify source_hash + BigQuery", [
      ["Row", "10"],
      ["Score", "0.9141"],
      ["Source hash", "0x02409faa...653bc654"],
    ]);
  }

  if (log.phase === "findings_crawl") {
    return renderTraceKeyValueCard("4/4", "Known findings crawl", [
      ["Issue", "token1OutBase stale in TRIBERagequit.sol"],
      ["Reference", "code-423n4/2021-11-fei #126"],
    ], "warn");
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
    baseScanLink.textContent = `BaseScan: ${certificate.transactionHash}`;
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
