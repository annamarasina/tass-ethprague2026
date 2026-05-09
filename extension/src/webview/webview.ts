import type { ExtensionToWebviewMessage, WebviewModel, WebviewToExtensionMessage } from "./types";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToExtensionMessage): void;
};

declare global {
  interface Window {
    __PRE_FLIGHT_MODEL__?: WebviewModel;
  }
}

const vscode = acquireVsCodeApi();
let model: WebviewModel = window.__PRE_FLIGHT_MODEL__ ?? {
  state: "idle",
  logs: [],
};

const runButton = document.querySelector<HTMLButtonElement>("#runAudit");
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

runButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "runAudit" });
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
    mintCertificate.disabled = !result.certificationEligible;
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
}

function replaceList(
  container: HTMLElement | null,
  items: Array<{ title: string; tag: string; body: string; meta?: string }>,
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

function renderItem(item: { title: string; tag: string; body: string; meta?: string }): HTMLElement {
  const row = document.createElement("div");
  row.className = "item";

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
