import * as vscode from "vscode";
import { EXTENSION_NAME } from "../constants";
import type { WebviewModel } from "./types";

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialModel: WebviewModel): string {
  const nonce = getNonce();
  const modelJson = JSON.stringify(initialModel).replace(/</g, "\\u003c");
  const cspSource = webview.cspSource;
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "webview.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${EXTENSION_NAME}</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark light;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    .app {
      display: flex;
      min-height: 100vh;
      flex-direction: column;
      gap: 14px;
      padding: 14px;
      box-sizing: border-box;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .title {
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
      font-weight: 650;
    }

    .subtitle {
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.35;
      word-break: break-word;
    }

    .status {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      background: var(--vscode-editor-background);
    }

    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .pill {
      flex: 0 0 auto;
      border: 1px solid var(--vscode-badge-background);
      border-radius: 999px;
      padding: 2px 7px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      font-size: 11px;
      text-transform: uppercase;
    }

    .file {
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.4;
      word-break: break-all;
    }

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 5px;
      padding: 7px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .log-panel {
      display: flex;
      min-height: 230px;
      flex: 1;
      flex-direction: column;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-terminal-background, var(--vscode-editor-background));
    }

    .log-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      font-weight: 600;
    }

    .logs {
      flex: 1;
      padding: 10px;
      overflow: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.45;
    }

    .log {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px;
      margin-bottom: 7px;
      color: var(--vscode-terminal-foreground, var(--vscode-foreground));
    }

    .log-meta {
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }

    .log-message {
      min-width: 0;
      word-break: break-word;
    }

    .log.success .log-message {
      color: var(--vscode-testing-iconPassed);
    }

    .log.warn .log-message {
      color: var(--vscode-testing-iconQueued);
    }

    .log.error .log-message {
      color: var(--vscode-testing-iconFailed);
    }

    .summary {
      display: none;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      background: var(--vscode-editor-background);
    }

    .summary.visible {
      display: block;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }

    .metric {
      min-width: 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 8px;
    }

    .metric-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.2;
    }

    .metric-value {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 650;
      line-height: 1.2;
      word-break: break-word;
    }

    .finding-preview {
      margin-top: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.4;
    }

    .summary-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .summary-title {
      min-width: 0;
    }

    .summary-title strong {
      display: block;
      font-size: 13px;
      line-height: 1.25;
    }

    .summary-subtitle {
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.35;
    }

    .action-button {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .action-button.hidden {
      display: none;
    }

    .blocked-note {
      display: none;
      margin-top: 10px;
      border-left: 3px solid var(--vscode-testing-iconFailed);
      padding: 8px 10px;
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      font-size: 12px;
      line-height: 1.4;
    }

    .blocked-note.visible {
      display: block;
    }

    .section {
      margin-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 10px;
    }

    .section-title {
      margin: 0 0 8px;
      color: var(--vscode-foreground);
      font-size: 12px;
      font-weight: 650;
      text-transform: uppercase;
    }

    .summary-text {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .item {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 8px;
      background: var(--vscode-sideBar-background);
    }

    .item-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .item-title {
      min-width: 0;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.35;
    }

    .item-body {
      margin-top: 5px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.4;
    }

    .tag {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 10px;
      line-height: 1.5;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .tag.critical,
    .tag.high {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }

    .tag.medium {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }

    .tag.low,
    .tag.info {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-inputValidation-infoForeground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
    }

    .meta-line {
      margin-top: 5px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      line-height: 1.35;
      word-break: break-word;
    }

    .empty {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <main class="app">
    <section class="header">
      <div class="title">
        <h1>${EXTENSION_NAME}</h1>
        <div class="subtitle">Autonomous pre-flight smart contract audit</div>
      </div>
      <button id="runAudit" type="button">Run Audit</button>
    </section>

    <section class="status">
      <div class="status-row">
        <strong id="statusMessage">Ready</strong>
        <span id="statePill" class="pill">idle</span>
      </div>
      <div id="selectedFile" class="file">No active Solidity file selected.</div>
    </section>

    <section class="log-panel">
      <div class="log-title">
        <span>Audit Log</span>
        <span id="logCount">0</span>
      </div>
      <div id="logs" class="logs">
        <div class="empty">Run an audit to stream activity here.</div>
      </div>
    </section>

    <section id="summary" class="summary">
      <div class="summary-header">
        <div class="summary-title">
          <strong>Pre-Flight Report</strong>
          <div id="reportSubtitle" class="summary-subtitle">Mock analysis result</div>
        </div>
        <button id="mintCertificate" class="action-button hidden" type="button">Mint Certificate</button>
      </div>
      <div class="summary-grid">
        <div class="metric">
          <div class="metric-label">Score</div>
          <div id="scoreMetric" class="metric-value">--</div>
        </div>
        <div class="metric">
          <div class="metric-label">Legal</div>
          <div id="legalMetric" class="metric-value">--</div>
        </div>
        <div class="metric">
          <div class="metric-label">Similarity</div>
          <div id="similarityMetric" class="metric-value">--</div>
        </div>
      </div>
      <div id="findingPreview" class="finding-preview"></div>
      <div id="blockedNote" class="blocked-note"></div>

      <div class="section">
        <h2 class="section-title">Intent and Legal Risk</h2>
        <p id="intentSummary" class="summary-text"></p>
        <div id="intentMismatches" class="list"></div>
      </div>

      <div class="section">
        <h2 class="section-title">Security Findings</h2>
        <div id="securityFindings" class="list"></div>
      </div>

      <div class="section">
        <h2 class="section-title">Storage Layout</h2>
        <div id="storageFindings" class="list"></div>
      </div>

      <div class="section">
        <h2 class="section-title">Sourcify Similarity</h2>
        <div id="closestMatches" class="list"></div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    window.__PRE_FLIGHT_MODEL__ = ${modelJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
