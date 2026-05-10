import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { AgentClient } from "../client/agentClient";
import { AgentCertificationClient, CertificationBlockedError } from "../client/certificationClient";
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
  private model: WebviewModel = {
    state: "idle",
    logs: [],
  };
  private readonly processManager: AgentProcessManager;
  private readonly agentClient: AgentClient;
  private readonly certificationClient: AgentCertificationClient;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly diagnostics: vscode.DiagnosticCollection,
  ) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? vscode.Uri.joinPath(extensionUri, "..").fsPath;
    this.processManager = new AgentProcessManager({ workspaceRoot, outputChannel });
    this.agentClient = new AgentClient(this.processManager);
    this.certificationClient = new AgentCertificationClient(this.processManager);
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
        if (message.type === "runComplianceAudit") {
          void this.runAuditFromActiveEditor({ includeComplianceTrace: true, sourceCode: message.sourceCode });
        }

        if (message.type === "runAudit") {
          void this.runAuditFromActiveEditor({ includeComplianceTrace: true, sourceCode: message.sourceCode });
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

  async runAuditFromActiveEditor(options: { includeComplianceTrace?: boolean; sourceCode?: string } = {}): Promise<void> {
    const selectedDocument = this.getSelectedSolidityDocument();
    const activeFile = selectedDocument?.uri.fsPath;
    const sourceCode = options.sourceCode || selectedDocument?.getText();

    await vscode.commands.executeCommand("workbench.view.extension.solidScan");
    clearDiagnostics(this.diagnostics);

    if (!sourceCode) {
      this.setModel({
        state: "error",
        selectedFilePath: undefined,
        logs: [],
        statusMessage: "Paste Solidity code to audit.",
      });
      this.appendLog("error", "init", "No source code provided.");
      return;
    }

    const auditId = `audit-${randomUUID()}`;

    this.outputChannel.appendLine(`Starting audit${activeFile ? ` for ${activeFile}` : " from pasted code"}`);
    this.setModel({
      state: "running",
      selectedFilePath: activeFile ?? "pasted-code.sol",
      logs: [],
      statusMessage: "Starting Solid Scan audit",
    });

    try {
      const auditResult = await this.agentClient.runAudit(
        {
          auditId,
          selectedFilePath: activeFile ?? "pasted-code.sol",
          sourceCode,
          chainId: 11155111,
          timestamp: new Date().toISOString(),
        },
        (event) => this.appendAuditLog(event),
      );

      this.setModel({
        ...this.model,
        state: auditResult.certificationEligible ? "report" : "blocked",
        selectedFilePath: activeFile ?? "pasted-code.sol",
        statusMessage: auditResult.certificationEligible ? "Report ready" : "Certification blocked by findings",
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

  private appendLog(level: WebviewLog["level"], phase: string, message: string, data?: Record<string, unknown>): void {
    const log: WebviewLog = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      data,
    };

    this.outputChannel.appendLine(`[${level}] ${phase}: ${message}`);
    const statusMessage = this.model.state === "running" ? statusForPhase(phase, message) : this.model.statusMessage;

    this.model = {
      ...this.model,
      statusMessage,
      logs: [...this.model.logs, log],
    };

    void this.view?.webview.postMessage({
      type: "appendLog",
      log,
      state: this.model.state,
      statusMessage,
    });
  }

  private appendAuditLog(event: AuditLogEvent): void {
    this.appendLog(event.level, event.phase, event.message, event.data);
  }

  private getSelectedSolidityDocument(): vscode.TextDocument | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor?.document.uri.fsPath.endsWith(".sol")) {
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

function statusForPhase(phase: string, message: string): string {
  switch (phase) {
    case "init":
      return "Preparing audit";
    case "compliance_classify":
      return "Agent interpreting contract intent";
    case "compliance_scrape":
      return "Agent calling compliance actors";
    case "compliance_payment":
    case "legal_payment":
      return "Preparing x402 payment path";
    case "swarm_fetch":
      return "Syncing compliance context with Swarm";
    case "compliance_sources":
      return "Retrieving context for AI model";
    case "compliance_analysis":
    case "legal_analysis":
      return "Running AI compliance analysis";
    case "compliance_output":
      return "Preparing compliance recommendations";
    case "security_parse":
      return "Preparing security comparison";
    case "security_similarity":
      return "Running embedded vulnerability comparison";
    case "security_storage":
      return "Checking Sourcify source-hash data";
    case "security_analysis":
      return "Preparing security findings";
    case "report":
      return "Generating report";
    default:
      return message || "Audit running";
  }
}
