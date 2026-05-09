import * as vscode from "vscode";
import { EXTENSION_NAME, RUN_AUDIT_COMMAND, SIDEBAR_VIEW_ID } from "./constants";
import { createDiagnosticsCollection } from "./diagnostics/applyDiagnostics";
import { PreflightViewProvider } from "./webview/PreflightViewProvider";

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  try {
    outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
    outputChannel.appendLine(`[EXTENSION] Starting activation for ${EXTENSION_NAME}...`);
    outputChannel.appendLine(`[EXTENSION] Extension URI: ${context.extensionUri.fsPath}`);
    
    const diagnostics = createDiagnosticsCollection();
    outputChannel.appendLine(`[EXTENSION] Diagnostics collection created successfully`);
    
    const sidebarProvider = new PreflightViewProvider(context.extensionUri, outputChannel, diagnostics);
    outputChannel.appendLine(`[EXTENSION] Sidebar provider initialized`);

    outputChannel.appendLine(`[EXTENSION] Registering webview view provider for ${SIDEBAR_VIEW_ID}...`);
    outputChannel.appendLine(`[EXTENSION] Registering command: ${RUN_AUDIT_COMMAND}...`);

    context.subscriptions.push(
      outputChannel,
      diagnostics,
      sidebarProvider,
      vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebarProvider),
      vscode.commands.registerCommand(RUN_AUDIT_COMMAND, () => sidebarProvider.runAuditFromActiveEditor()),
    );
    
    outputChannel.appendLine(`[EXTENSION] ✓ ${EXTENSION_NAME} activated successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "no stack trace";
    outputChannel?.appendLine(`[ERROR] Extension activation failed: ${message}`);
    outputChannel?.appendLine(`[ERROR] Stack: ${stack}`);
    throw error;
  }
}

export function deactivate(): void {
  try {
    outputChannel?.appendLine(`[EXTENSION] Starting deactivation for ${EXTENSION_NAME}...`);
    outputChannel?.appendLine(`[EXTENSION] ✓ ${EXTENSION_NAME} deactivated successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel?.appendLine(`[ERROR] Extension deactivation error: ${message}`);
  }
}
