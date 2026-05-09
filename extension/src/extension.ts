import * as vscode from "vscode";
import { EXTENSION_NAME, RUN_AUDIT_COMMAND, SIDEBAR_VIEW_ID } from "./constants";

class PreflightSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: false,
    };
    webviewView.webview.html = this.renderPlaceholder();
  }

  showStatus(message: string): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.renderPlaceholder(message);
  }

  private renderPlaceholder(status = "Ready to audit the active Solidity file."): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    h1 {
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 600;
    }

    p {
      margin: 0;
      line-height: 1.45;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>${EXTENSION_NAME}</h1>
  <p>${escapeHtml(status)}</p>
</body>
</html>`;
  }
}

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
  const sidebarProvider = new PreflightSidebarProvider();

  outputChannel.appendLine(`${EXTENSION_NAME} activated`);

  context.subscriptions.push(
    outputChannel,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebarProvider),
    vscode.commands.registerCommand(RUN_AUDIT_COMMAND, async () => {
      const activeEditor = vscode.window.activeTextEditor;
      const activeFile = activeEditor?.document.uri.fsPath;
      const message = activeFile ? `Audit requested for ${activeFile}` : "Open a Solidity file before running an audit.";

      outputChannel?.appendLine(message);
      sidebarProvider.showStatus(message);
      await vscode.commands.executeCommand("workbench.view.extension.preflightAuditor");
      void vscode.window.showInformationMessage(message);
    }),
  );
}

export function deactivate(): void {
  outputChannel?.appendLine(`${EXTENSION_NAME} deactivated`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

