import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { MockAuditClient } from "../client/mockAuditClient";
import { RUN_AUDIT_COMMAND } from "../constants";
import type { AuditLogEvent } from "../types";
import { getWebviewHtml } from "./getWebviewHtml";
import type { WebviewLog, WebviewModel, WebviewToExtensionMessage } from "./types";

export class PreflightViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];
  private model: WebviewModel = {
    state: "idle",
    logs: [],
  };
  private readonly mockAuditClient = new MockAuditClient();

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

    const sourceCode = activeEditor.document.getText();
    const auditId = `audit-${randomUUID()}`;

    this.outputChannel.appendLine(`Starting mock audit for ${activeFile}`);
    this.setModel({
      state: "running",
      selectedFilePath: activeFile,
      logs: [],
      statusMessage: "Audit running",
    });

    try {
      const auditResult = await this.mockAuditClient.runAudit(
        {
          auditId,
          selectedFilePath: activeFile,
          sourceCode,
          chainId: 84532,
          timestamp: new Date().toISOString(),
        },
        (event) => this.appendAuditLog(event),
      );

      this.setModel({
        ...this.model,
        state: auditResult.certificationEligible ? "report" : "blocked",
        selectedFilePath: activeFile,
        statusMessage: auditResult.certificationEligible ? "Mock report ready" : "Certification blocked by mock findings",
        auditResult,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown audit error";
      this.setModel({
        ...this.model,
        state: "error",
        selectedFilePath: activeFile,
        statusMessage: message,
      });
      this.appendLog("error", "error", message);
    }
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

  private appendAuditLog(event: AuditLogEvent): void {
    this.appendLog(event.level, event.phase, event.message);
  }
}
