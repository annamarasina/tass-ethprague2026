import * as vscode from "vscode";
import { RUN_AUDIT_COMMAND } from "../constants";
import { getWebviewHtml } from "./getWebviewHtml";
import type { WebviewLog, WebviewModel, WebviewToExtensionMessage } from "./types";

export class PreflightViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];
  private model: WebviewModel = {
    state: "idle",
    logs: [],
  };

  constructor(private readonly extensionUri: vscode.Uri, private readonly outputChannel: vscode.OutputChannel) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, this.model);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        if (message.type === "runAudit") {
          void vscode.commands.executeCommand(RUN_AUDIT_COMMAND);
        }
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  async runAuditFromActiveEditor(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor?.document.uri.fsPath;

    await vscode.commands.executeCommand("workbench.view.extension.preflightAuditor");

    if (!activeFile) {
      this.setModel({
        state: "error",
        selectedFilePath: undefined,
        logs: [],
        statusMessage: "Open a Solidity file before running an audit.",
      });
      this.appendLog("error", "init", "No active Solidity file selected.");
      return;
    }

    if (!activeFile.endsWith(".sol")) {
      this.setModel({
        state: "error",
        selectedFilePath: activeFile,
        logs: [],
        statusMessage: "Select a Solidity file before running an audit.",
      });
      this.appendLog("error", "init", "Active editor is not a .sol file.");
      return;
    }

    this.outputChannel.appendLine(`Starting mock audit for ${activeFile}`);
    this.setModel({
      state: "running",
      selectedFilePath: activeFile,
      logs: [],
      statusMessage: "Audit running",
    });

    await this.streamMockAudit(activeFile);
  }

  private async streamMockAudit(activeFile: string): Promise<void> {
    const phases: Array<Pick<WebviewLog, "level" | "phase" | "message">> = [
      { level: "info", phase: "init", message: "Reading selected Solidity file" },
      { level: "info", phase: "legal_payment", message: "Preparing Apify x402 payment request" },
      { level: "info", phase: "legal_scrape", message: "Streaming recent exploit and regulatory sources" },
      { level: "info", phase: "security_parse", message: "Parsing Solidity AST" },
      { level: "info", phase: "security_similarity", message: "Comparing against Sourcify-backed exploit patterns" },
      { level: "info", phase: "security_storage", message: "Checking storage layout signals" },
      { level: "success", phase: "report", message: "Mock audit shell complete" },
    ];

    for (const phase of phases) {
      await delay(420);
      this.appendLog(phase.level, phase.phase, phase.message);
    }

    this.setModel({
      ...this.model,
      state: "report",
      selectedFilePath: activeFile,
      statusMessage: "Mock report ready",
    });
  }

  private setModel(model: WebviewModel): void {
    this.model = model;
    void this.view?.webview.postMessage({ type: "replaceState", model });
  }

  private appendLog(level: WebviewLog["level"], phase: string, message: string): void {
    const log: WebviewLog = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
    };

    this.outputChannel.appendLine(`[${level}] ${phase}: ${message}`);
    this.model = {
      ...this.model,
      logs: [...this.model.logs, log],
    };

    void this.view?.webview.postMessage({
      type: "appendLog",
      log,
      state: this.model.state,
      statusMessage: this.model.statusMessage,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

