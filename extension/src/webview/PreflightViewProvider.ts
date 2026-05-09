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
        if (message.type === "runComplianceAudit") {
          void this.runAuditFromActiveEditor({ includeComplianceTrace: true });
        }

        if (message.type === "runAudit") {
          void vscode.commands.executeCommand(RUN_AUDIT_COMMAND);
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

  async runAuditFromActiveEditor(options: { includeComplianceTrace?: boolean } = {}): Promise<void> {
    const selectedDocument = this.getSelectedSolidityDocument();
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
      statusMessage: options.includeComplianceTrace ? "Compliance audit running" : "Audit running",
    });

    try {
      if (options.includeComplianceTrace) {
        await this.appendComplianceSimilarityTrace(auditId);
      }

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

  private async appendComplianceSimilarityTrace(auditId: string): Promise<void> {
    const trace: Array<{ level: WebviewLog["level"]; phase: string; message: string; delayMs?: number }> = [
      {
        level: "info",
        phase: "similarity_search",
        message: `🔍✨ ========== [1/5] Similarity search (embedding + full ranking) 🔎📊 ==========
/Users/tianhaogu/Library/Python/3.9/lib/python/site-packages/urllib3/_init_.py:35: NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+, currently the 'ssl' module is compiled with 'LibreSSL 2.8.3'. See: https://github.com/urllib3/urllib3/issues/3020
  warnings.warn(
Loading cached embeddings from source_code/test_dataset_11_openrouter_baai_bge-m3_embeddings.npy
  🥇 rank  1  row= 10  similarity=0.9141  ██████████████████ ⭐
  🥈 rank  2  row=  4  similarity=0.7409  ██████████████ ⭐
  🥉 rank  3  row=  9  similarity=0.7222  ██████████████ ⭐
  📌 rank  4  row=  5  similarity=0.7120  ██████████████ ⭐
  📌 rank  5  row=  0  similarity=0.7021  ██████████████ ⭐
  📌 rank  6  row=  2  similarity=0.6982  █████████████ ⭐
  📌 rank  7  row=  6  similarity=0.6450  ████████████ ⭐
  📌 rank  8  row=  1  similarity=0.6411  ████████████ ⭐
  📌 rank  9  row= 11  similarity=0.6333  ████████████ ⭐
  📌 rank 10  row=  7  similarity=0.6330  ████████████ ⭐
  📌 rank 11  row=  3  similarity=0.6176  ████████████ ⭐
  📌 rank 12  row=  8  similarity=0.6095  ████████████ ⭐`,
      },
      {
        level: "success",
        phase: "similarity_filter",
        message: `🎯✂️ ========== [2/5] Filter similarity > 0.90 🧮🔥 ==========
  ✅🔝 row=10  score=0.9141  🎉💯`,
      },
      {
        level: "info",
        phase: "sourcify_hash",
        message: `🗄️🔗 ========== [3/5] Sourcify source_hash + BigQuery (MOCK) 📡🧱 ==========
  🧬 MOCK hash for row 10: 0x02409faad32169a9ae3a2477a0f094573eb2a256cf1e211269654edf653bc654 (score=0.9141) 🔐📎`,
      },
      {
        level: "warn",
        phase: "findings_crawl",
        message: `🕷️🐙 ========== [4/5] Known findings crawl (MOCK) — focus dataset row 11 🐛📰 ==========
  🎫 MOCK issue: Value of token1OutBase might became stale in TRIBERagequit.sol #126 🏷️
  🌐 URL: https://github.com/code-423n4/2021-11-fei-findings/issues/126 🔗✨`,
      },
      {
        level: "success",
        phase: "compliance_output",
        message: `————
output:
The USER contract, a simple implementation of a fiat-collateralized stablecoin, allows the owner to mint tokens and users to burn them. The REFERENCE findings highlight a vulnerability in the TRIBE/FEI ragequit contract where a state variable (token1OutBase) can become stale, leading to incorrect calculations during user interactions. This analysis will assess whether the USER contract exhibits a similar class of vulnerability and provide recommendations for improvement.`,
      },
    ];

    for (const event of trace) {
      this.appendLog(event.level, event.phase, event.message);
      await delay(event.delayMs ?? 220);
    }

    this.outputChannel.appendLine(`[info] compliance_trace: completed for ${auditId}`);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
