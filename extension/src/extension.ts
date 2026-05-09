import * as vscode from "vscode";
import { EXTENSION_NAME, RUN_AUDIT_COMMAND, SIDEBAR_VIEW_ID } from "./constants";
import { createDiagnosticsCollection } from "./diagnostics/applyDiagnostics";
import { PreflightViewProvider } from "./webview/PreflightViewProvider";

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
  const diagnostics = createDiagnosticsCollection();
  const sidebarProvider = new PreflightViewProvider(context.extensionUri, outputChannel, diagnostics);

  outputChannel.appendLine(`${EXTENSION_NAME} activated`);

  context.subscriptions.push(
    outputChannel,
    diagnostics,
    sidebarProvider,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebarProvider),
    vscode.commands.registerCommand(RUN_AUDIT_COMMAND, () => sidebarProvider.runAuditFromActiveEditor()),
  );
}

export function deactivate(): void {
  outputChannel?.appendLine(`${EXTENSION_NAME} deactivated`);
}
