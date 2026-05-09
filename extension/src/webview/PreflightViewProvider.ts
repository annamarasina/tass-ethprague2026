import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { AgentClient } from "../client/agentClient";
import { CertificationBlockedError, MockCertificationClient } from "../client/certificationClient";
import { AgentProcessManager } from "../client/processManager";
import { RUN_AUDIT_COMMAND } from "../constants";
import { applyDiagnostics, clearDiagnostics } from "../diagnostics/applyDiagnostics";
import { jumpToFinding } from "../diagnostics/jumpToFinding";
import type { AuditLogEvent } from "../types";
import { getWebviewHtml } from "./getWebviewHtml";
import type { WebviewLog, WebviewModel, WebviewToExtensionMessage } from "./types";

export class PreflightViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];
  private selectedFileUri?: vscode.Uri;
  private model: WebviewModel = {
    state: "idle",
    logs: [],
  };
  private readonly processManager: AgentProcessManager;
  private readonly agentClient: AgentClient;
  private readonly certificationClient = new MockCertificationClient();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly diagnostics: vscode.DiagnosticCollection,
  ) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? vscode.Uri.joinPath(extensionUri, "..").fsPath;
    this.processManager = new AgentProcessManager({ workspaceRoot, outputChannel });
    this.agentClient = new AgentClient(this.processManager);
  }

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

        if (message.type === "selectSolidityFile") {
          void this.selectSolidityFile();
        }

        if (message.type === "jumpToFinding") {
          void jumpToFinding(this.model.auditResult, message.findingId);
        }

        if (message.type === "mintCertificate") {
          void this.mintCertificate();
        }

        if (message.type === "openExternal") {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.processManager.dispose();
  }

  async runAuditFromActiveEditor(): Promise<void> {
    const selectedDocument = await this.getSelectedSolidityDocument();
    const activeFile = selectedDocument?.uri.fsPath;

    await vscode.commands.executeCommand("workbench.view.extension.preflightAuditor");
    clearDiagnostics(this.diagnostics);

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

    const sourceCode = selectedDocument.getText();
    const auditId = `audit-${randomUUID()}`;

    this.outputChannel.appendLine(`Starting mock audit for ${activeFile}`);
    this.setModel({
      state: "running",
      selectedFilePath: activeFile,
      logs: [],
      statusMessage: "Audit running",
    });

    try {
      const auditResult = await this.agentClient.runAudit(
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
      applyDiagnostics(this.diagnostics, auditResult);
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

  private async selectSolidityFile(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Solidity: ["sol"],
      },
      title: "Select Solidity file to audit",
    });

    const [uri] = selected ?? [];

    if (!uri) {
      return;
    }

    this.selectedFileUri = uri;
    this.setModel({
      ...this.model,
      selectedFilePath: uri.fsPath,
      statusMessage: "Solidity file selected",
    });
    this.appendLog("info", "init", `Selected ${uri.fsPath}`);
  }

  private async getSelectedSolidityDocument(): Promise<vscode.TextDocument | undefined> {
    if (this.selectedFileUri) {
      return vscode.workspace.openTextDocument(this.selectedFileUri);
    }

    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor?.document.uri.fsPath.endsWith(".sol")) {
      this.selectedFileUri = activeEditor.document.uri;
      return activeEditor.document;
    }

    return undefined;
  }

  private async mintCertificate(): Promise<void> {
    const auditResult = this.model.auditResult;

    if (!auditResult) {
      this.appendLog("error", "mint", "Run an audit before minting a certificate.");
      return;
    }

    if (!auditResult.certificationEligible) {
      this.appendLog("error", "mint", "Certification is blocked by critical findings.");
      return;
    }

    this.setModel({
      ...this.model,
      state: "running",
      statusMessage: "Minting certificate",
    });

    try {
      const certificateResult = await this.certificationClient.issueCertificate(auditResult, (event) => this.appendAuditLog(event));
      this.setModel({
        ...this.model,
        state: "certified",
        statusMessage: "Certificate minted",
        certificateResult,
      });
    } catch (error) {
      const message =
        error instanceof CertificationBlockedError || error instanceof Error ? error.message : "Unknown certificate mint error";
      this.setModel({
        ...this.model,
        state: "error",
        statusMessage: message,
      });
      this.appendLog("error", "mint", message);
    }
  }
}
