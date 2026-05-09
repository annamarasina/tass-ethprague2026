import * as vscode from "vscode";
import type { AuditResult, SecurityFinding, Severity } from "../types";

export function createDiagnosticsCollection(): vscode.DiagnosticCollection {
  return vscode.languages.createDiagnosticCollection("pre-flight-auditor");
}

export function applyDiagnostics(collection: vscode.DiagnosticCollection, auditResult: AuditResult): void {
  collection.clear();

  const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

  for (const finding of auditResult.securityReport.findings) {
    const uri = vscode.Uri.file(finding.filePath);
    const diagnostics = diagnosticsByFile.get(uri.toString()) ?? [];

    diagnostics.push(toDiagnostic(finding));
    diagnosticsByFile.set(uri.toString(), diagnostics);
  }

  for (const [uriString, diagnostics] of diagnosticsByFile.entries()) {
    collection.set(vscode.Uri.parse(uriString), diagnostics);
  }
}

export function clearDiagnostics(collection: vscode.DiagnosticCollection): void {
  collection.clear();
}

function toDiagnostic(finding: SecurityFinding): vscode.Diagnostic {
  const startLine = Math.max(finding.lineStart - 1, 0);
  const endLine = Math.max((finding.lineEnd ?? finding.lineStart) - 1, startLine);
  const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
  const diagnostic = new vscode.Diagnostic(
    range,
    `${finding.title}: ${finding.description}`,
    toDiagnosticSeverity(finding.severity),
  );

  diagnostic.code = finding.id;
  diagnostic.source = "Pre-Flight Auditor";
  return diagnostic;
}

function toDiagnosticSeverity(severity: Severity): vscode.DiagnosticSeverity {
  if (severity === "critical" || severity === "high") {
    return vscode.DiagnosticSeverity.Error;
  }

  if (severity === "medium") {
    return vscode.DiagnosticSeverity.Warning;
  }

  return vscode.DiagnosticSeverity.Information;
}

