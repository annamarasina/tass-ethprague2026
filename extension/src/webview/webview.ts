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
    legalReport: {
      riskLevel: string;
      intentSummary: string;
      codeIntentMismatch: Array<{
        claim: string;
        observedCodeBehavior: string;
        severity: string;
        line?: number;
      }>;
    };
    securityReport: {
      maxSimilarityPercent: number;
      findings: Array<{
        id: string;
        title: string;
        severity: string;
        description: string;
        lineStart: number;
        lineEnd?: number;
        recommendation: string;
      }>;
      storageLayoutFindings: Array<{
        title: string;
        severity: string;
        description: string;
        affectedSlot?: string;
        referenceContract?: string;
      }>;
      closestMatches: Array<{
        contractName: string;
        label: string;
        similarityPercent: number;
        source: string;
        address?: string;
        metadataUrl?: string;
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
  | { type: "runAudit" }
  | { type: "selectSolidityFile" }
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
const selectFileButton = document.querySelector<HTMLButtonElement>("#selectFile");
const statusMessage = document.querySelector<HTMLElement>("#statusMessage");
const statePill = document.querySelector<HTMLElement>("#statePill");
const selectedFile = document.querySelector<HTMLElement>("#selectedFile");
const logs = document.querySelector<HTMLElement>("#logs");
const logCount = document.querySelector<HTMLElement>("#logCount");
const summary = document.querySelector<HTMLElement>("#summary");
const scoreMetric = document.querySelector<HTMLElement>("#scoreMetric");
const legalMetric = document.querySelector<HTMLElement>("#legalMetric");
const similarityMetric = document.querySelector<HTMLElement>("#similarityMetric");
const findingPreview = document.querySelector<HTMLElement>("#findingPreview");
const reportSubtitle = document.querySelector<HTMLElement>("#reportSubtitle");
const mintCertificate = document.querySelector<HTMLButtonElement>("#mintCertificate");
const blockedNote = document.querySelector<HTMLElement>("#blockedNote");
const intentSummary = document.querySelector<HTMLElement>("#intentSummary");
const intentMismatches = document.querySelector<HTMLElement>("#intentMismatches");
const securityFindings = document.querySelector<HTMLElement>("#securityFindings");
const storageFindings = document.querySelector<HTMLElement>("#storageFindings");
const closestMatches = document.querySelector<HTMLElement>("#closestMatches");
const certifiedPanel = document.querySelector<HTMLElement>("#certifiedPanel");
const certificateHash = document.querySelector<HTMLElement>("#certificateHash");
const baseScanLink = document.querySelector<HTMLButtonElement>("#baseScanLink");
const sourcifyLink = document.querySelector<HTMLButtonElement>("#sourcifyLink");

runButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "runAudit" });
});

selectFileButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "selectSolidityFile" });
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
    runButton.disabled = model.state === "running";
  }

  if (selectFileButton) {
    selectFileButton.disabled = model.state === "running";
  }

  if (statusMessage) {
    statusMessage.textContent = model.statusMessage ?? defaultStatus(model);
  }

  if (statePill) {
    statePill.textContent = model.state;
  }

  if (selectedFile) {
    selectedFile.textContent = model.selectedFilePath ?? "No active Solidity file selected.";
  }

  if (logCount) {
    logCount.textContent = String(model.logs.length);
  }

  if (!logs) {
    return;
  }

  if (model.logs.length === 0) {
    logs.innerHTML = `<div class="empty">Run an audit to stream activity here.</div>`;
    return;
  }

  logs.replaceChildren(...model.logs.map(renderLog));
  logs.scrollTop = logs.scrollHeight;

  renderSummary();
}

function renderLog(log: WebviewModel["logs"][number]): HTMLElement {
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
  summary.classList.toggle("visible", Boolean(result));

  if (!result) {
    return;
  }

  if (scoreMetric) {
    scoreMetric.textContent = String(result.totalScore);
  }

  if (legalMetric) {
    legalMetric.textContent = result.legalReport.riskLevel;
  }

  if (similarityMetric) {
    similarityMetric.textContent = `${result.securityReport.maxSimilarityPercent}%`;
  }

  if (findingPreview) {
    const findingCount = result.securityReport.findings.length;
    const blocking = result.blockingReasons.length > 0 ? ` Blocking: ${result.blockingReasons.join(", ")}` : "";
    findingPreview.textContent = `${findingCount} finding${findingCount === 1 ? "" : "s"}.${blocking}`;
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

  if (intentSummary) {
    intentSummary.textContent = result.legalReport.intentSummary;
  }

  replaceList(
    intentMismatches,
    result.legalReport.codeIntentMismatch.map((mismatch) => ({
      title: mismatch.claim,
      tag: mismatch.severity,
      body: mismatch.observedCodeBehavior,
      meta: mismatch.line ? `line ${mismatch.line}` : undefined,
    })),
    "No intent mismatches found.",
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
    "No security findings found.",
  );

  replaceList(
    storageFindings,
    result.securityReport.storageLayoutFindings.map((finding) => ({
      title: finding.title,
      tag: finding.severity,
      body: finding.description,
      meta: [finding.affectedSlot ? `slot ${finding.affectedSlot}` : undefined, finding.referenceContract].filter(Boolean).join(" | "),
    })),
    "No storage layout findings found.",
  );

  replaceList(
    closestMatches,
    result.securityReport.closestMatches.map((match) => ({
      title: match.contractName,
      tag: match.label,
      body: `${match.similarityPercent}% similarity via ${match.source}`,
      meta: [match.address, match.metadataUrl].filter(Boolean).join(" | "),
    })),
    "No close matches found.",
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
