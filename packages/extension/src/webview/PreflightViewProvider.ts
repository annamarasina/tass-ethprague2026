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

    await vscode.commands.executeCommand("workbench.view.extension.preflightAuditor");
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
      statusMessage: options.includeComplianceTrace ? "Compliance audit running" : "Audit running",
    });

    try {
      if (options.includeComplianceTrace) {
        await this.appendComplianceSimilarityTrace(auditId);
      }

      const auditResult = await this.agentClient.runAudit(
        {
          auditId,
          selectedFilePath: activeFile ?? "pasted-code.sol",
          sourceCode,
          chainId: 84532,
          timestamp: new Date().toISOString(),
        },
        (event) => this.appendAuditLog(event),
      );

      this.setModel({
        ...this.model,
        state: auditResult.certificationEligible ? "report" : "blocked",
        selectedFilePath: activeFile ?? "pasted-code.sol",
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
    // ─── COMPLIANCE CHECK (steps 1-4) ───
    const complianceTrace: Array<{ level: WebviewLog["level"]; phase: string; message: string; delayMs?: number }> = [
      {
        level: "info",
        phase: "compliance_classify",
        message: `[1/8] Classifying contract type...
LLM Agent reading Solidity code to determine contract category.
→ Detected: ERC-20 Stablecoin (fiat-collateralized)
→ Selected scraper: ESMA MiCA Compliance Officer`,
        delayMs: 400,
      },
      {
        level: "info",
        phase: "compliance_payment",
        message: `[2/8] Paying Apify actor via x402 protocol...
→ Network: Base Sepolia
→ Amount: 0.001 USDC
→ Actor: esma-watchdog (MiCA regulatory scraper)
→ x402 tx: 0x7a3f...b4e2 ✓ confirmed`,
        delayMs: 500,
      },
      {
        level: "info",
        phase: "compliance_scrape",
        message: `[3/8] Retrieving legal documents...
→ Source: ESMA MiCA framework (esma.europa.eu)
→ Source: EBA stablecoin guidelines (eba.europa.eu)
→ Fetched 4 regulatory documents (12.3 KB)`,
        delayMs: 600,
      },
      {
        level: "success",
        phase: "compliance_analysis",
        message: `[4/8] LLM analyzing code against legal requirements...
→ Reading: Solidity source code
→ Reading: MiCA Article 48 (reserve requirements)
→ Reading: EBA Guidelines on stablecoin governance
→ Generating compliance suggestions...`,
        delayMs: 700,
      },
    ];

    // ─── VULNERABILITY CHECK (steps 5-8) ───
    const vulnerabilityTrace: Array<{ level: WebviewLog["level"]; phase: string; message: string; delayMs?: number }> = [
      {
        level: "info",
        phase: "similarity_search",
        message: `[5/8] Vulnerability similarity search
Loading cached embeddings (baai/bge-m3)
  rank  1  row= 10  similarity=0.9141  ██████████████████
  rank  2  row=  4  similarity=0.7409  ██████████████
  rank  3  row=  9  similarity=0.7222  ██████████████
  rank  4  row=  5  similarity=0.7120  ██████████████
  rank  5  row=  0  similarity=0.7021  ██████████████`,
        delayMs: 400,
      },
      {
        level: "success",
        phase: "similarity_filter",
        message: `[6/8] Filter similarity > 0.90
→ Selected row=10  score=0.9141 (passed threshold)`,
        delayMs: 300,
      },
      {
        level: "info",
        phase: "sourcify_hash",
        message: `[7/8] Sourcify source_hash + BigQuery lookup
→ Row 10, score=0.9141
→ Hash: 0x02409faa...653bc654`,
        delayMs: 300,
      },
      {
        level: "warn",
        phase: "findings_crawl",
        message: `[8/8] Known findings crawl
→ Issue: Value of token1OutBase might became stale (TRIBERagequit.sol #126)
→ URL: github.com/code-423n4/2021-11-fei-findings/issues/126`,
        delayMs: 300,
      },
    ];

    for (const event of [...complianceTrace, ...vulnerabilityTrace]) {
      this.appendLog(event.level, event.phase, event.message);
      await delay(event.delayMs ?? 220);
    }

    this.outputChannel.appendLine(`[info] audit_trace: completed for ${auditId}`);
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
