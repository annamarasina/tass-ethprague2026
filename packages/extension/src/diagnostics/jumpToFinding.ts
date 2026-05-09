import * as vscode from "vscode";
import type { AuditResult } from "../types";

export async function jumpToFinding(auditResult: AuditResult | undefined, findingId: string): Promise<void> {
  const finding = auditResult?.securityReport.findings.find((candidate) => candidate.id === findingId);

  if (!finding) {
    void vscode.window.showWarningMessage(`Finding not found: ${findingId}`);
    return;
  }

  if (!finding.filePath) {
    void vscode.window.showErrorMessage(`Invalid file path for finding: ${findingId}`);
    return;
  }

  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(finding.filePath));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const startLine = Math.max(finding.lineStart - 1, 0);
    const endLine = Math.max((finding.lineEnd ?? finding.lineStart) - 1, startLine);
    const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);

    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`Failed to open finding: ${message}`);
  }
}

