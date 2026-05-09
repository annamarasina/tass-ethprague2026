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

